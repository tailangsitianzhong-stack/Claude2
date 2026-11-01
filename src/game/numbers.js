// ミニゲーム「ナンバーズ」
// ・生きている全員に 1〜6 のカードが配られ、それぞれ 1 枚を伏せて出す
// ・一斉に表にして、一番大きい数字の人が勝ち
// ・数字が 2 人で被ったら、その 2 人が最下位(撃つ順番はランダム)。このとき一番小さい数字の人は罰なし
// ・被りがなければ、一番小さい数字の人が最下位
// ・同じ数字に 3 人以上、または被りが 2 組以上(例:2,2,4,4)ならやり直し
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// コンピューターが選ぶ数字の重み(1 は避けがち)
const AI_WEIGHTS = [0.5, 0.9, 1.1, 1.2, 1.15, 1.0];

const SUIT_RED = new Set([1, 3, 5]);

function cardFaceTexture(n) {
  const w = 256;
  const h = 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe4c8';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#6a4a2a';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  const col = SUIT_RED.has(n) ? '#9a1a14' : '#1a1410';
  ctx.fillStyle = col;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 190px Georgia, "Times New Roman", serif';
  ctx.fillText(String(n), w / 2, h / 2 + 8);
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText(String(n), 40, 46);
  ctx.save();
  ctx.translate(w - 40, h - 46);
  ctx.rotate(Math.PI);
  ctx.fillText(String(n), 0, 0);
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function cardBackTexture() {
  const w = 256;
  const h = 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe4c8';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#6a1414';
  ctx.fillRect(16, 16, w - 32, h - 32);
  ctx.strokeStyle = 'rgba(230,190,120,0.6)';
  ctx.lineWidth = 3;
  for (let i = -h; i < w + h; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 16);
    ctx.lineTo(i + h, h);
    ctx.moveTo(i + h, 16);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d8b25a';
  ctx.lineWidth = 6;
  ctx.strokeRect(26, 26, w - 52, h - 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let backTex = null;
const faceTex = {};
const edgeMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });

// 伏せた状態で作る。pivot.rotation.z を 0 にすると表になる
function createCard(n) {
  backTex ??= cardBackTexture();
  faceTex[n] ??= cardFaceTexture(n);
  const face = new THREE.MeshStandardMaterial({ map: faceTex[n], roughness: 0.55 });
  const back = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.55 });
  // 面の順: +x, -x, +y(表), -y(裏), +z, -z
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.0016, 0.105), [edgeMat, edgeMat, face, back, edgeMat, edgeMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  pivot.rotation.z = Math.PI;
  const g = new THREE.Group();
  g.add(pivot);
  g.userData = { pivot, n };
  return g;
}

export class NumbersGame {
  constructor(scene) {
    this.scene = scene;
    this.title = 'ナンバーズ';
    this.cards = [];
    this.firstTime = true;
    this.hand = document.getElementById('hand');
    this.hand.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this._pick?.(Number(b.dataset.n));
      }),
    );
    window.addEventListener('keydown', (e) => {
      if (this._pick && /^Digit[1-6]$/.test(e.code) && this.hand.style.display !== 'none') this._pick(Number(e.code.slice(5)));
    });
  }

  // カードを置く場所(その人の左手前。銃は右手前に来る)
  cardSpot(game, seat) {
    const ch = game.players[seat].character;
    const dir = ch.position.clone().sub(game.tablePos).setY(0).normalize();
    const right = V(dir.z, 0, -dir.x);
    const p = game.tablePos.clone().addScaledVector(dir, 0.48).addScaledVector(right, -0.14);
    p.y = game.tableTop + 0.001;
    return { p, yaw: Math.atan2(dir.x, dir.z) };
  }

  cleanup() {
    for (const c of this.cards) this.scene.remove(c);
    this.cards = [];
    this.hand.style.display = 'none';
  }

  // 1 人がカードを伏せて置く
  async placeCard(game, pl, n) {
    const spot = this.cardSpot(game, pl.seat);
    const card = createCard(n);
    card.rotation.y = spot.yaw;
    const ch = pl.character;
    const u = ch.userData;
    if (pl.seat !== game.playerSeat || game.playerDead) {
      // 左手を伸ばして置く
      const arm = u.arms[1];
      arm.controlled = true;
      u.reachTarget = 0.32;
      const from = arm.target.clone();
      const to = ch.worldToLocal(spot.p.clone().add(V(0, 0.02, 0)));
      await game.tween(0.45, (t) => arm.target.lerpVectors(from, to, easeInOut(t)));
      arm.controlled = false;
      u.reachTarget = 0;
    }
    card.position.copy(spot.p);
    this.scene.add(card);
    this.cards.push(card);
    game.sfx.card();
  }

  aiPick(game, p) {
    const total = AI_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = game.rand(p.seat) * total;
    for (let i = 0; i < 6; i++) {
      r -= AI_WEIGHTS[i];
      if (r <= 0) return i + 1;
    }
    return 6;
  }

  label(game, pl) {
    return game.short(pl);
  }

  async play(game) {
    for (;;) {
      const alive = game.players.filter((p) => p.alive);
      const playerIn = alive.some((p) => p.seat === game.playerSeat);
      game.say(
        this.firstTime
          ? 'ナンバーズ:1〜6 のカードから 1 枚を伏せて出せ。一番大きい数字が勝ち。被るか、一番小さいと最下位だ。'
          : 'ナンバーズ:カードを 1 枚選べ',
      );
      this.firstTime = false;
      for (const p of alive) p.character.userData.focus = game.tablePos.clone().setY(game.tableTop);
      await game.wait(playerIn ? 1.2 : 2.0);

      // コンピューターは考える時間を置いてから出す。プレイヤーは手札から選ぶ
      const picks = new Map();
      const jobs = alive.map(async (p) => {
        const n = await game.decide(
          p,
          async () => {
            this.hand.style.display = '';
            document.exitPointerLock?.();
            const v = await new Promise((res) => (this._pick = res));
            this._pick = null;
            this.hand.style.display = 'none';
            return v;
          },
          async () => {
            await game.wait(0.8 + game.rand(p.seat) * 2.2);
            return this.aiPick(game, p);
          },
        );
        picks.set(p.seat, n);
        await this.placeCard(game, p, n);
      });
      await Promise.all(jobs);
      for (const p of alive) p.character.userData.focus = null;

      // 一斉に表にする
      game.say('オープン!');
      await game.wait(0.7);
      game.sfx.card();
      await game.tween(0.5, (t) => {
        const e = easeInOut(t);
        for (const c of this.cards) {
          c.userData.pivot.rotation.z = Math.PI * (1 - e);
          c.userData.pivot.position.y = Math.sin(Math.PI * e) * 0.05;
        }
      });

      const line = alive.map((p) => `${this.label(game, p)} ${picks.get(p.seat)}`).join(' ・ ');
      game.say(line);
      await game.wait(2.0);

      // 判定
      const groups = new Map();
      for (const p of alive) {
        const n = picks.get(p.seat);
        if (!groups.has(n)) groups.set(n, []);
        groups.get(n).push(p);
      }
      const dupes = [...groups.entries()].filter(([, ps]) => ps.length >= 2);
      if (dupes.some(([, ps]) => ps.length >= 3) || dupes.length >= 2) {
        game.say(dupes.length >= 2 ? '2 組が被った…… やり直しだ' : '3 人以上が同じ数字…… やり直しだ');
        await game.wait(2.2);
        this.cleanup();
        continue;
      }

      const uniques = [...groups.entries()].filter(([, ps]) => ps.length === 1);
      const best = uniques.length ? uniques.reduce((a, b) => (b[0] > a[0] ? b : a)) : null;
      const winText = best ? `勝ち:${this.label(game, best[1][0])}(${best[0]})` : '';

      let losers;
      if (dupes.length === 1) {
        const [n, ps] = dupes[0];
        const order = game.rand() < 0.5 ? [ps[0], ps[1]] : [ps[1], ps[0]];
        game.say(`${this.label(game, ps[0])} と ${this.label(game, ps[1])} が ${n} で被った!${winText ? '\n' + winText : ''}`);
        await game.wait(2.4);
        game.say(`2 人とも撃つ。先に撃つのは ${this.label(game, order[0])}`);
        await game.wait(2.0);
        losers = order;
      } else {
        const worst = uniques.reduce((a, b) => (b[0] < a[0] ? b : a));
        game.say(`一番小さいのは ${this.label(game, worst[1][0])}(${worst[0]})\n${winText}`);
        await game.wait(2.4);
        losers = [worst[1][0]];
      }
      return losers;
    }
  }
}
