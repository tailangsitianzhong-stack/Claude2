// ミニゲーム「ブラインド・ハイ＆ロー」
// ・A〜10 のカード 40 枚(4 スート × 10)を使う
// ・全員 10 点から始め、4 ラウンド行う
// ・各ラウンド、配られたカードを自分では見ずに額にかざす(自分以外のカードだけが見える)
// ・自分のカードが全員の中で「一番大きい(High)」か「一番小さい(Low)」かを一斉に親指でサイン
// ・当たり +3 点、外れ −2 点(同じ数字で並んだ場合も「一番」とみなして当たり)
// ・4 ラウンド後、点数が一番少ない人が最下位(同点なら全員が撃つ・順番はランダム)
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const SUITS = ['♠', '♥', '♦', '♣'];
const RANK = (v) => (v === 1 ? 'A' : String(v));
const ROUNDS = 4;
const START_POINTS = 10;

const texCache = {};
function faceTexture(v, suit) {
  const key = `${v}${suit}`;
  if (texCache[key]) return texCache[key];
  const w = 256;
  const h = 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3ead6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#7a5a3a';
  ctx.lineWidth = 5;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  const red = suit === '♥' || suit === '♦';
  ctx.fillStyle = red ? '#a8161a' : '#16120e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 150px Georgia, "Times New Roman", serif';
  ctx.fillText(RANK(v), w / 2, h / 2 - 22);
  ctx.font = '90px "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif';
  ctx.fillText(suit, w / 2, h / 2 + 92);
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText(RANK(v), 38, 40);
  ctx.font = '34px "DejaVu Sans", sans-serif';
  ctx.fillText(suit, 38, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache[key] = t;
  return t;
}

let backTex = null;
function backTexture() {
  if (backTex) return backTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 360;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3ead6';
  ctx.fillRect(0, 0, 256, 360);
  ctx.fillStyle = '#1c2a4a';
  ctx.fillRect(14, 14, 228, 332);
  ctx.strokeStyle = 'rgba(220,190,120,0.55)';
  ctx.lineWidth = 2;
  for (let r = 10; r < 220; r += 14) {
    ctx.beginPath();
    ctx.arc(128, 180, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d8b25a';
  ctx.lineWidth = 5;
  ctx.strokeRect(24, 24, 208, 312);
  backTex = new THREE.CanvasTexture(c);
  backTex.colorSpace = THREE.SRGBColorSpace;
  return backTex;
}

const edgeMat = new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: 0.8 });

// 立てたカード(表が +z、裏が -z)
function createCard(v, suit) {
  const face = new THREE.MeshStandardMaterial({ map: faceTexture(v, suit), roughness: 0.5 });
  const back = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.5 });
  // 面の順: +x, -x, +y, -y, +z(表), -z(裏)
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.0016), [edgeMat, edgeMat, edgeMat, edgeMat, face, back]);
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// 親指を立てた握りこぶし(+y が親指の向き)
function createThumbHand(skinColor) {
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
  const g = new THREE.Group();
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), skin);
  fist.scale.set(0.95, 0.85, 1.05);
  g.add(fist);
  for (let i = 0; i < 4; i++) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), skin);
    k.position.set(-0.024 + i * 0.016, -0.004 - i * 0.004, 0.036);
    g.add(k);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.045, 4, 10), skin);
  thumb.position.set(0, 0.055, 0.012);
  g.add(thumb);
  g.traverse((m) => (m.castShadow = true));
  g.visible = false;
  return g;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class BlindHighLow {
  constructor(scene) {
    this.scene = scene;
    this.title = 'ブラインド・ハイ＆ロー';
    this.firstTime = true;
    this.objects = [];
    this.holding = new Map(); // seat → 額のカード
    this.signs = new Map(); // seat → 親指のサイン
    this.buttons = document.getElementById('hl-buttons');
    this.buttons.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this._choose?.(b.dataset.c);
      }),
    );
    window.addEventListener('keydown', (e) => {
      if (!this._choose) return;
      if (e.code === 'ArrowUp' || e.code === 'KeyH') this._choose('high');
      if (e.code === 'ArrowDown' || e.code === 'KeyL') this._choose('low');
    });
  }

  label(game, p) {
    return p.seat === game.playerSeat ? 'あなた' : game.presets[p.seat].short;
  }

  cleanup(game) {
    for (const o of this.objects) o.parent?.remove(o);
    this.objects = [];
    this.holding.clear();
    for (const s of this.signs.values()) s.parent?.remove(s);
    this.signs.clear();
    this.buttons.style.display = 'none';
    this._choose = null;
    if (game) {
      for (const p of game.players) {
        for (const arm of p.character.userData.arms) {
          arm.controlled = false;
          arm.hand.visible = true;
        }
      }
    }
  }

  // 毎フレーム:額のカードを持つ右手と、サインを出す左手を合わせる
  update() {
    if (!this.game) return;
    for (const [seat, card] of this.holding) {
      const ch = this.game.players[seat].character;
      if (!ch.userData.dead) {
        const arm = ch.userData.arms[0];
        arm.controlled = true;
        const p = ch.worldToLocal(card.getWorldPosition(new THREE.Vector3()));
        arm.target.lerp(p.add(V(-0.06, -0.05, -0.03)), 0.3);
      }
    }
    for (const [seat, sign] of this.signs) {
      const ch = this.game.players[seat].character;
      const arm = ch.userData.arms[1];
      if (!sign.visible || ch.userData.dead) continue;
      arm.controlled = true;
      arm.hand.visible = false;
      arm.target.lerp(sign.userData.target, 0.25);
      sign.position.copy(arm.hand.position).add(V(0, 0.01, 0.03));
    }
  }

  // AI:見えている 3 枚と、これまでに表になったカードから確率を計算して決める
  aiChoice(seat, deal, seen) {
    const others = [...deal.entries()].filter(([s]) => s !== seat).map(([, c]) => c.v);
    const counts = new Array(11).fill(4);
    counts[0] = 0;
    for (const v of [...seen, ...others]) counts[v]--;
    const total = counts.reduce((a, b) => a + b, 0);
    const mx = Math.max(...others);
    const mn = Math.min(...others);
    let pHigh = 0;
    let pLow = 0;
    for (let v = 1; v <= 10; v++) {
      if (v >= mx) pHigh += counts[v];
      if (v <= mn) pLow += counts[v];
    }
    pHigh /= total;
    pLow /= total;
    let c = pHigh === pLow ? (Math.random() < 0.5 ? 'high' : 'low') : pHigh > pLow ? 'high' : 'low';
    if (Math.random() < 0.08) c = c === 'high' ? 'low' : 'high'; // たまに読み違える
    return c;
  }

  async play(game) {
    this.game = game;
    const alive = game.players.filter((p) => p.alive);
    const playerIn = alive.some((p) => p.seat === game.playerSeat);
    const points = new Map(alive.map((p) => [p.seat, START_POINTS]));
    const showPoints = () => {
      game.tags = Object.fromEntries([...points].map(([s, v]) => [s, `${v}点`]));
      game.renderPlayers();
    };
    showPoints();

    game.say(
      this.firstTime
        ? 'ブラインド・ハイ＆ロー:自分のカードだけが見えない。\n自分が一番大きい(High)か一番小さい(Low)かを当てろ。\n当たり +3 点・外れ −2 点、4 ラウンドで一番点が少ない者が撃つ。'
        : 'ブラインド・ハイ＆ロー:4 ラウンド勝負',
    );
    await game.wait(this.firstTime ? 4.2 : 2.0);
    this.firstTime = false;

    const deck = shuffle(SUITS.flatMap((suit) => Array.from({ length: 10 }, (_, i) => ({ v: i + 1, suit }))));
    const seen = []; // これまでに表になったカード

    for (let round = 1; round <= ROUNDS; round++) {
      game.say(`ラウンド ${round} / ${ROUNDS}`);
      // 配る
      const deal = new Map();
      for (const p of alive) deal.set(p.seat, deck.pop());
      const center = game.tablePos.clone().setY(game.tableTop + 0.05);
      const jobs = alive.map(async (p, i) => {
        await game.wait(i * 0.18);
        const c = deal.get(p.seat);
        // 頭の上にもカードを浮かべる(向きに関係なく見えるように)。自分の分は見えない
        const red = c.suit === '♥' || c.suit === '♦';
        game.setFloat(p.seat, `${RANK(c.v)}${c.suit}`, { color: red ? '#ff7a6a' : '#f3e2bd' });
        const card = createCard(c.v, c.suit);
        this.objects.push(card);
        game.sfx.card();
        if (p.seat === game.playerSeat && !game.playerDead) {
          // 自分のカードは見えない:手前に伏せて置いておく
          const dir = p.character.position.clone().sub(game.tablePos).setY(0).normalize();
          const pos = game.tablePos.clone().addScaledVector(dir, 0.46);
          pos.y = game.tableTop + 0.001;
          card.rotation.set(Math.PI / 2, Math.atan2(dir.x, dir.z), 0, 'YXZ');
          card.position.copy(center);
          this.scene.add(card);
          const from = center.clone();
          await game.tween(0.4, (t) => card.position.lerpVectors(from, pos, easeInOut(t)));
          card.userData.mine = true;
          this.myCard = card;
        } else {
          // 額にかざす(表を外側に向ける)
          const head = p.character.userData.head;
          this.scene.add(card);
          card.position.copy(center);
          const from = center.clone();
          const fromQ = card.quaternion.clone();
          await game.tween(0.5, (t) => {
            head.updateWorldMatrix(true, false);
            const to = head.localToWorld(V(0, 0.105, 0.135));
            const toQ = head.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0)));
            const e = easeInOut(t);
            card.position.lerpVectors(from, to, e);
            card.position.y += Math.sin(Math.PI * e) * 0.1;
            card.quaternion.slerpQuaternions(fromQ, toQ, e);
          });
          head.attach(card);
          this.holding.set(p.seat, card);
        }
      });
      await Promise.all(jobs);

      // 予想
      const choices = new Map();
      for (const p of alive) if (p.seat !== game.playerSeat || game.playerDead) choices.set(p.seat, this.aiChoice(p.seat, deal, seen));
      if (playerIn && !game.playerDead) {
        game.say('あなたのカードは見えない。\n自分が一番大きいか、一番小さいか?');
        this.buttons.style.display = '';
        document.exitPointerLock?.();
        const c = await new Promise((res) => (this._choose = res));
        this._choose = null;
        this.buttons.style.display = 'none';
        choices.set(game.playerSeat, c);
      } else {
        game.say('全員が考えている……');
        await game.wait(1.6);
      }

      // 一斉にサイン
      game.say('せーの!');
      for (const p of alive) {
        if (p.seat === game.playerSeat && !game.playerDead) continue;
        let sign = this.signs.get(p.seat);
        if (!sign) {
          sign = createThumbHand(game.presets[p.seat].skin);
          p.character.add(sign);
          this.signs.set(p.seat, sign);
        }
        sign.userData.target = V(0.17, 1.02, 0.3);
        sign.rotation.set(0, 0, choices.get(p.seat) === 'low' ? Math.PI : 0);
        sign.visible = true;
      }
      await game.wait(1.6);

      // オープン:自分のカードを表にする
      if (this.myCard) {
        const card = this.myCard;
        const q0 = card.quaternion.clone();
        const q1 = card.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI));
        const p0 = card.position.clone();
        game.sfx.card();
        await game.tween(0.5, (t) => {
          const e = easeInOut(t);
          card.quaternion.slerpQuaternions(q0, q1, e);
          card.position.copy(p0);
          card.position.y += Math.sin(Math.PI * e) * 0.06;
        });
      }
      const vals = alive.map((p) => deal.get(p.seat).v);
      const mx = Math.max(...vals);
      const mn = Math.min(...vals);
      const lines = alive.map((p) => {
        const v = deal.get(p.seat).v;
        const c = choices.get(p.seat);
        const ok = (c === 'high' && v === mx) || (c === 'low' && v === mn);
        points.set(p.seat, points.get(p.seat) + (ok ? 3 : -2));
        return `${this.label(game, p)} ${RANK(v)}${c === 'high' ? '👍' : '👎'} ${ok ? '○ +3' : '✕ −2'}`;
      });
      for (const v of deal.values()) seen.push(v.v);
      game.say(lines.join('\n'));
      showPoints();
      await game.wait(3.4);

      // 片付け
      for (const s of this.signs.values()) s.visible = false;
      for (const p of alive) {
        const ch = p.character;
        for (const arm of ch.userData.arms) {
          arm.controlled = false;
          arm.hand.visible = true;
        }
      }
      for (const o of this.objects) o.parent?.remove(o);
      this.objects = [];
      this.holding.clear();
      this.myCard = null;
      game.clearFloats();
      await game.wait(0.5);
    }

    // 結果
    const ranking = [...points].sort((a, b) => b[1] - a[1]);
    const low = ranking[ranking.length - 1][1];
    const losers = shuffle(alive.filter((p) => points.get(p.seat) === low));
    const top = ranking[0];
    const name = (seat) => this.label(game, game.players[seat]);
    game.say(`最終結果:${ranking.map(([s, v]) => `${name(s)} ${v}点`).join(' ・ ')}\n勝ち:${name(top[0])}`);
    await game.wait(3.2);
    if (losers.length > 1) {
      game.say(`${losers.map((p) => this.label(game, p)).join(' と ')} が ${low} 点で並んだ。全員撃つ。\n先に撃つのは ${this.label(game, losers[0])}`);
      await game.wait(2.6);
    }
    this.game = null;
    return losers;
  }
}
