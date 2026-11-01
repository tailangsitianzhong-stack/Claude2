// スタート画面(人数の選択・ひとりで遊ぶ・通信対戦のつなぎ方)
import { Net, connectRoom, qrHostInvite, qrGuestAnswer } from './net.js';
import { renderQR, scanQR } from './qr.js';

// 人数に応じて使う席(base の席から見て、向かい合わせなどになるように)
export function seatLayout(n, base = 0) {
  const offs = n === 2 ? [0, 2] : n === 3 ? [0, 1, 3] : [0, 1, 2, 3];
  return offs.map((o) => (base + o) % 4);
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class Lobby {
  constructor(game, controls, refresh) {
    this.game = game;
    this.controls = controls;
    this.refresh = refresh; // キャラクターの表示を更新する
    this.count = 4;
    this.netCount = 4;
    this.net = null;
    this.scanner = null;

    // 人数(ひとりで遊ぶ)
    document.querySelectorAll('#lobby [data-count]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.count = Number(b.dataset.count);
        document.querySelectorAll('#lobby [data-count]').forEach((x) => x.classList.toggle('on', x === b));
        this.preview();
      }),
    );
    // 人数(通信対戦のホスト)
    document.querySelectorAll('#online [data-ncount]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (b.disabled) return;
        this.netCount = Number(b.dataset.ncount);
        this.renderMembers();
      }),
    );
    const click = (id, fn) =>
      $(id).addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
    click('btn-solo', () => this.startSolo());
    click('btn-online', () => this.showOnline());
    click('btn-online-back', () => this.showLobby());
    click('btn-room-host', () => this.roomConnect(true));
    click('btn-room-join', () => this.roomConnect(false));
    click('btn-qr-host', () => this.qrHost());
    click('btn-qr-join', () => this.qrGuest());
    click('btn-net-start', () => this.hostStart());
    click('btn-net-leave', () => this.leave());
    for (const id of ['online', 'lobby']) {
      $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
      $(id).addEventListener('keydown', (e) => e.stopPropagation());
    }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && $('lobby').style.display !== 'none' && document.activeElement?.tagName !== 'INPUT') this.startSolo();
    });
    // 席を変えたら空席の配置も変える
    document.querySelectorAll('#seat-buttons button').forEach((b) => b.addEventListener('click', () => setTimeout(() => this.preview(), 0)));
    window.addEventListener('keydown', (e) => {
      if (/^Digit[1-4]$/.test(e.code)) setTimeout(() => this.preview(), 0);
    });

    // 試合終了後の「もう一度」
    game.onRestart = () => {
      if (this.net?.isHost) this.hostStart();
      else if (!this.net) this.showLobby();
    };
    try {
      const saved = localStorage.getItem('saloon-name');
      if (saved) $('net-name').value = saved;
    } catch {
      /* 保存できない環境では何もしない */
    }
    this.preview();
  }

  // 開始前に、人数に合わせて空席のキャラクターを隠す
  preview() {
    if (this.game.started) return;
    const seats = seatLayout(this.count, this.controls.seatIndex);
    for (const p of this.game.players) {
      p.present = seats.includes(p.seat);
      p.alive = p.present;
    }
    this.game.renderPlayers();
    this.refresh();
  }

  showLobby() {
    this.stopScan();
    $('online').style.display = 'none';
    $('lobby').style.display = '';
    this.game.ui.seatButtons.style.display = '';
    this.preview();
  }

  showOnline() {
    $('lobby').style.display = 'none';
    $('online').style.display = '';
    $('net-choose').style.display = '';
    $('net-room-view').style.display = 'none';
    this.game.ui.seatButtons.style.display = 'none';
  }

  hidePanels() {
    this.stopScan();
    $('lobby').style.display = 'none';
    $('online').style.display = 'none';
  }

  startSolo() {
    if (this.game.busy) return;
    const local = this.controls.seatIndex;
    const layout = seatLayout(this.count, local);
    const seats = [0, 1, 2, 3].map((i) => ({ kind: !layout.includes(i) ? 'absent' : i === local ? 'local' : 'cpu' }));
    this.hidePanels();
    this.game.setup({ seats, localSeat: local, seed: (Math.random() * 2 ** 32) >>> 0, net: null });
    this.refresh();
    this.game.startMatch();
  }

  // ─── 通信対戦 ───
  myName() {
    const n = ($('net-name').value || 'プレイヤー').trim().slice(0, 10) || 'プレイヤー';
    try {
      localStorage.setItem('saloon-name', n);
    } catch {
      /* 保存できない環境では何もしない */
    }
    return n;
  }

  newNet(host) {
    this.net?.close();
    const net = new Net({ name: this.myName() });
    net.isHost = host;
    if (host) net.members.set(net.selfId, { name: net.name });
    net.onLobby = () => this.renderMembers();
    net.onStart = (msg) => this.applyStart(msg);
    net.onLeft = (id, name) => {
      if (this.game.started) this.game.say(`${name ?? '相手'} との接続が切れた。\nその席は CPU が代わりに遊ぶ`, 3);
    };
    this.net = net;
    $('net-choose').style.display = 'none';
    $('net-room-view').style.display = '';
    $('net-qr-area').innerHTML = '';
    $('net-host-controls').style.display = host ? '' : 'none';
    this.renderMembers();
    return net;
  }

  status(text) {
    $('net-status').textContent = text;
  }

  renderMembers() {
    const net = this.net;
    if (!net) return;
    const ul = $('net-members');
    const members = [...net.members];
    ul.innerHTML = members
      .map(([id, m]) => `<li>${id === net.hostId || (net.isHost && id === net.selfId) ? '👑 ' : '・'}${esc(m.name)}${id === net.selfId ? '(あなた)' : ''}</li>`)
      .join('');
    if (net.isHost) {
      const humans = members.length;
      if (this.netCount < humans) this.netCount = Math.min(4, humans);
      document.querySelectorAll('#online [data-ncount]').forEach((b) => {
        const n = Number(b.dataset.ncount);
        b.disabled = n < humans;
        b.classList.toggle('on', n === this.netCount);
      });
      $('btn-net-start').disabled = humans < 1;
      if (members.length > 4) this.status('4 人までしか遊べません');
    } else if (members.length) {
      this.status('つながりました。ホストが開始するのを待っています');
    }
  }

  async roomConnect(host) {
    const room = ($('net-room').value || '').trim();
    if (!room) {
      $('net-room').focus();
      return;
    }
    const net = this.newNet(host);
    this.status(host ? `部屋「${room}」を作っています……` : `部屋「${room}」を探しています……`);
    try {
      const kinds = await connectRoom(net, room);
      this.status(
        host
          ? `部屋「${room}」を作りました。参加者を待っています(${kinds.join(' / ')})`
          : `部屋「${room}」でホストを探しています……(${kinds.join(' / ')})`,
      );
    } catch (e) {
      this.status(`接続できませんでした:${e.message}`);
    }
  }

  // QR:ホスト
  qrHost() {
    const net = this.newNet(true);
    net.relay = true;
    this.status('ゲストを招待してください(1 人ずつ)');
    const area = $('net-qr-area');
    area.innerHTML = '<div class="row"><button id="btn-invite">ゲストを招待する</button></div><div id="invite-box"></div>';
    $('btn-invite').addEventListener('click', (e) => {
      e.stopPropagation();
      this.qrInvite();
    });
  }

  async qrInvite() {
    const box = $('invite-box');
    box.innerHTML = '<div class="status">招待コードを作っています……</div>';
    const inv = await qrHostInvite(this.net);
    box.innerHTML = `
      <div class="note">① ゲストにこの QR を読んでもらう(読めないときはコードを送る)</div>
      <div class="qr" id="qr-offer"></div>
      <textarea readonly id="code-offer"></textarea>
      <div class="row"><button id="btn-copy-offer">コードをコピー</button></div>
      <div class="note">② ゲストの返事の QR を読み取る(またはコードを貼り付け)</div>
      <div class="row"><button id="btn-scan-answer">カメラで読む</button></div>
      <video id="scan-video" style="display:none"></video>
      <textarea id="code-answer" placeholder="返事のコード(SR1.〜)"></textarea>
      <div class="row"><button id="btn-accept">つなぐ</button></div>`;
    $('code-offer').value = inv.code;
    await renderQR($('qr-offer'), inv.code);
    const accept = async (code) => {
      try {
        await inv.accept(code);
        this.status('接続しています……');
        box.innerHTML = '';
      } catch (err) {
        this.status(`つなげませんでした:${err.message}`);
      }
    };
    this.bindCopy('btn-copy-offer', 'code-offer');
    $('btn-accept').addEventListener('click', (e) => {
      e.stopPropagation();
      accept($('code-answer').value);
    });
    $('btn-scan-answer').addEventListener('click', async (e) => {
      e.stopPropagation();
      const code = await this.scan($('scan-video'));
      if (code) accept(code);
    });
  }

  // QR:ゲスト
  qrGuest() {
    const net = this.newNet(false);
    this.status('ホストの QR を読み取ってください');
    const area = $('net-qr-area');
    area.innerHTML = `
      <div class="row"><button id="btn-scan-offer">カメラでホストの QR を読む</button></div>
      <video id="scan-video" style="display:none"></video>
      <textarea id="code-offer-in" placeholder="ホストの招待コード(SR1.〜)"></textarea>
      <div class="row"><button id="btn-read-offer">読み込む</button></div>
      <div id="answer-box"></div>`;
    const useOffer = async (code) => {
      try {
        this.status('返事を作っています……');
        const ans = await qrGuestAnswer(net, code);
        $('answer-box').innerHTML = `
          <div class="note">この QR をホストに読んでもらう(読めないときはコードを送る)</div>
          <div class="qr" id="qr-answer"></div>
          <textarea readonly id="code-answer-out"></textarea>
          <div class="row"><button id="btn-copy-answer">コードをコピー</button></div>`;
        $('code-answer-out').value = ans;
        await renderQR($('qr-answer'), ans);
        this.bindCopy('btn-copy-answer', 'code-answer-out');
        this.status('ホストが返事を読み取るとつながります');
      } catch (err) {
        this.status(`読み込めませんでした:${err.message}`);
      }
    };
    $('btn-read-offer').addEventListener('click', (e) => {
      e.stopPropagation();
      useOffer($('code-offer-in').value);
    });
    $('btn-scan-offer').addEventListener('click', async (e) => {
      e.stopPropagation();
      const code = await this.scan($('scan-video'));
      if (code) useOffer(code);
    });
  }

  bindCopy(btnId, areaId) {
    $(btnId).addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = $(areaId).value;
      try {
        await navigator.clipboard.writeText(text);
        $(btnId).textContent = 'コピーしました';
      } catch {
        $(areaId).select();
      }
    });
  }

  async scan(video) {
    this.stopScan();
    video.style.display = '';
    this.scanner = scanQR(video);
    try {
      return await this.scanner.promise;
    } catch (err) {
      this.status(`カメラを使えません:${err.message}(コードの貼り付けでもつなげます)`);
      return null;
    } finally {
      video.style.display = 'none';
      this.scanner = null;
    }
  }

  stopScan() {
    this.scanner?.stop();
    this.scanner = null;
  }

  // ホスト:人数と席を決めて全員に開始を知らせる
  hostStart() {
    const net = this.net;
    if (!net?.isHost) return;
    const members = [...net.members].slice(0, 4);
    const n = Math.max(this.netCount, members.length, 2);
    const layout = seatLayout(n, 0);
    const seats = [0, 1, 2, 3].map(() => ({ kind: 'absent' }));
    layout.forEach((seat, i) => {
      const m = members[i];
      seats[seat] = m ? { kind: 'human', id: m[0], name: m[1].name } : { kind: 'cpu' };
    });
    const msg = { t: 'start', seed: (Math.random() * 2 ** 32) >>> 0, seats };
    net.broadcast(msg);
    net.seatOwner = new Map(seats.map((s, i) => [i, s.id]).filter(([, id]) => id));
    this.applyStart(msg);
  }

  applyStart(msg) {
    const net = this.net;
    const local = msg.seats.findIndex((s) => s.id === net.selfId);
    if (local < 0) {
      this.status('人数がいっぱいでした');
      return;
    }
    if (this.game.started || this.game.over) this.game.restart(true);
    const seats = msg.seats.map((s) => ({
      kind: s.kind === 'human' ? (s.id === net.selfId ? 'local' : 'remote') : s.kind,
      name: s.kind === 'human' ? s.name : undefined,
    }));
    net.inputs.clear();
    this.hidePanels();
    this.game.ui.seatButtons.style.display = 'none';
    this.game.setup({ seats, localSeat: local, seed: msg.seed, net });
    this.refresh();
    this.game.startMatch();
  }

  leave() {
    this.net?.close();
    this.net = null;
    this.game.net = null;
    $('net-qr-area').innerHTML = '';
    this.status('');
    this.showOnline();
  }
}
