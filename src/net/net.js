// 通信対戦の土台
// ・ホスト 1 人とゲスト(最大 3 人)。全員が同じ試合を同時に動かし、人間の「選択」だけを送り合う
// ・つなぎ方は 2 通り(どちらも最後は WebRTC で直接通信)
//   1. Trystero:部屋名だけで相手を探す(Nostr / BitTorrent トラッカー / MQTT の公開サーバーを同時に使う)
//   2. QR:ホストとゲストが接続情報(SDP)を QR コードで 1 往復やり取りする
// ・メッセージには ID を付けて重複を捨てる(複数の経路から同じものが届いても 1 回だけ処理)
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export class Net {
  constructor({ name }) {
    this.selfId = uid();
    this.name = name;
    this.isHost = false;
    this.members = new Map(); // clientId → { name }
    this.links = new Map(); // linkId → { send(msg), clientId }
    this.seen = new Set();
    this.inputs = new Map(); // key → value(先に届いた分を取っておく)
    this.waiters = new Map(); // key → { resolve, seat }
    this.seatOwner = new Map(); // seat → clientId
    this.relay = false; // QR 方式のホストは、ゲストからの通信を他のゲストへ中継する
    this.onLobby = () => {};
    this.onStart = () => {};
    this.onStatus = () => {};
    this.onLeft = () => {};
    this.closed = false;
  }

  // ─── 送受信 ───
  broadcast(msg, exceptLink = null) {
    if (!msg.id) {
      msg.id = uid();
      msg.from = this.selfId;
      this.seen.add(msg.id);
    }
    for (const [linkId, link] of this.links) {
      if (linkId === exceptLink) continue;
      try {
        link.send(msg);
      } catch (e) {
        console.warn('send failed', e);
      }
    }
  }

  receive(msg, linkId) {
    if (!msg || !msg.id || this.seen.has(msg.id)) return;
    this.seen.add(msg.id);
    const link = this.links.get(linkId);
    if (link && msg.from && !link.clientId) link.clientId = msg.from;
    if (this.relay) this.broadcast(msg, linkId);
    switch (msg.t) {
      case 'hello':
        if (this.isHost) {
          this.members.set(msg.from, { name: msg.name });
          this.sendLobby();
        }
        break;
      case 'lobby':
        this.members = new Map(msg.members.map((m) => [m.id, { name: m.name }]));
        this.hostId = msg.host;
        this.onLobby();
        break;
      case 'start':
        this.seatOwner = new Map(msg.seats.map((s, i) => [i, s.id]).filter(([, id]) => id));
        this.onStart(msg);
        break;
      case 'in':
        this.gotInput(msg.key, msg.v);
        break;
      case 'bye':
        this.memberLeft(msg.from);
        break;
    }
  }

  sendLobby() {
    const members = [[this.selfId, { name: this.name }], ...[...this.members].filter(([id]) => id !== this.selfId)];
    this.members = new Map(members);
    this.broadcast({ t: 'lobby', host: this.selfId, members: members.map(([id, m]) => ({ id, name: m.name })) });
    this.onLobby();
  }

  // ─── 試合中の入力 ───
  sendInput(key, v) {
    this.broadcast({ t: 'in', key, v });
  }

  gotInput(key, v) {
    const w = this.waiters.get(key);
    if (w) {
      this.waiters.delete(key);
      w.resolve(v);
    } else this.inputs.set(key, v);
  }

  // 通信相手の選択が届くまで待つ。その人がいなくなったら undefined(CPU に交代)
  waitInput(key, seat) {
    if (this.inputs.has(key)) {
      const v = this.inputs.get(key);
      this.inputs.delete(key);
      return Promise.resolve(v);
    }
    const owner = this.seatOwner.get(seat);
    if (owner && !this.members.has(owner)) return Promise.resolve(undefined);
    return new Promise((resolve) => this.waiters.set(key, { resolve, seat }));
  }

  memberLeft(clientId) {
    if (!clientId || !this.members.has(clientId)) return;
    const name = this.members.get(clientId)?.name;
    this.members.delete(clientId);
    // その人の席の入力待ちは CPU に任せる
    for (const [key, w] of this.waiters) {
      if (this.seatOwner.get(w.seat) === clientId) {
        this.waiters.delete(key);
        w.resolve(undefined);
      }
    }
    if (this.isHost) this.sendLobby();
    else this.onLobby();
    this.onLeft(clientId, name);
  }

  linkClosed(linkId) {
    const link = this.links.get(linkId);
    this.links.delete(linkId);
    if (!link?.clientId) return;
    // 他の経路でまだつながっていれば何もしない
    for (const l of this.links.values()) if (l.clientId === link.clientId) return;
    this.memberLeft(link.clientId);
  }

  // 新しい経路がつながったとき(ゲストは名乗る、ホストは部屋の様子を送る)
  linkOpened() {
    if (this.isHost) this.sendLobby();
    else this.broadcast({ t: 'hello', name: this.name });
  }

  close() {
    if (this.closed) return;
    this.broadcast({ t: 'bye' });
    this.closed = true;
    for (const fn of this._cleanup ?? []) fn();
    for (const w of this.waiters.values()) w.resolve(undefined);
    this.waiters.clear();
  }
}

// ─── 1. Trystero(部屋名でつなぐ) ───
const APP_ID = 'saloon-roulette-3d';
const STRATEGIES = {
  nostr: 'https://cdn.jsdelivr.net/npm/@trystero-p2p/nostr@0.25.4/+esm',
  torrent: 'https://cdn.jsdelivr.net/npm/@trystero-p2p/torrent@0.25.4/+esm',
  mqtt: 'https://cdn.jsdelivr.net/npm/@trystero-p2p/mqtt@0.25.4/+esm',
};

export async function connectRoom(net, roomName) {
  net._cleanup ??= [];
  const ok = [];
  // 複数の公開サーバー網に同時に入る。どれかが落ちていても、残りでつながる
  await Promise.all(
    Object.entries(STRATEGIES).map(async ([kind, url]) => {
      try {
        const mod = await import(/* @vite-ignore */ url);
        const room = mod.joinRoom({ appId: APP_ID }, `room-${roomName}`);
        const action = room.makeAction('msg');
        action.onMessage = (data, { peerId }) => net.receive(data, `${kind}:${peerId}`);
        room.onPeerJoin = (peerId) => {
          net.links.set(`${kind}:${peerId}`, { send: (m) => action.send(m, { target: peerId }) });
          net.linkOpened();
        };
        room.onPeerLeave = (peerId) => net.linkClosed(`${kind}:${peerId}`);
        net._cleanup.push(() => room.leave());
        ok.push(kind);
      } catch (e) {
        console.warn(`trystero ${kind} unavailable`, e);
      }
    }),
  );
  if (!ok.length) throw new Error('公開サーバーに接続できませんでした');
  return ok;
}

// ─── 2. QR(接続情報を QR で 1 往復) ───
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

async function waitIce(pc, ms = 2500) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise((res) => {
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        res();
      }
    });
  });
}

// SDP を圧縮して短い文字列にする(QR に収まるように)
async function pack(desc) {
  const bytes = new TextEncoder().encode(JSON.stringify({ t: desc.type[0], s: desc.sdp }));
  const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return 'SR1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function unpack(code) {
  code = code.trim();
  if (!code.startsWith('SR1.')) throw new Error('コードの形式が違います');
  const b64 = code.slice(4).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const o = JSON.parse(await new Response(ds).text());
  return { type: o.t === 'o' ? 'offer' : 'answer', sdp: o.s };
}

function attachChannel(net, ch, linkId) {
  ch.onopen = () => {
    net.links.set(linkId, { send: (m) => ch.send(JSON.stringify(m)) });
    net.linkOpened();
  };
  ch.onmessage = (e) => {
    try {
      net.receive(JSON.parse(e.data), linkId);
    } catch (err) {
      console.warn(err);
    }
  };
  ch.onclose = () => net.linkClosed(linkId);
}

// ホスト:ゲスト 1 人分の招待コードを作る。返事のコードを accept() に渡すとつながる
export async function qrHostInvite(net) {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const linkId = `qr:${uid()}`;
  const ch = pc.createDataChannel('game', { ordered: true });
  attachChannel(net, ch, linkId);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') net.linkClosed(linkId);
  };
  (net._cleanup ??= []).push(() => pc.close());
  await pc.setLocalDescription(await pc.createOffer());
  await waitIce(pc);
  const code = await pack(pc.localDescription);
  return {
    code,
    accept: async (answerCode) => {
      const ans = await unpack(answerCode);
      if (ans.type !== 'answer') throw new Error('ゲストの返事のコードではありません');
      await pc.setRemoteDescription(ans);
    },
  };
}

// ゲスト:ホストの招待コードから返事のコードを作る
export async function qrGuestAnswer(net, offerCode) {
  const offer = await unpack(offerCode);
  if (offer.type !== 'offer') throw new Error('ホストの招待コードではありません');
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const linkId = `qr:${uid()}`;
  pc.ondatachannel = (e) => attachChannel(net, e.channel, linkId);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') net.linkClosed(linkId);
  };
  (net._cleanup ??= []).push(() => pc.close());
  await pc.setRemoteDescription(offer);
  await pc.setLocalDescription(await pc.createAnswer());
  await waitIce(pc);
  return pack(pc.localDescription);
}
