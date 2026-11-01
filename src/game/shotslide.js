// ミニゲーム「ショット・スライド」
// ・テーブル中央に的(チョークの円)。1 人ずつ、ショットグラスを自分の側から滑らせる
// ・左右に揺れるパワーメーターを「止める!」で止めた強さで滑る。金色の範囲がちょうど的に届く強さ
// ・強すぎると向こう側の縁から落ちる(落下は一番悪い)
// ・全員が滑らせたら、的の中心から一番遠い人が最下位(落下が複数、または全く同じ距離ならサイコロ決着)
// 目安:1 人 6〜8 秒 × 4 人 ≒ 30〜50 秒
import * as THREE from 'three';
import { tableSpot, seatFrame, label, isMe, easeOut, rollOff, shuffle, V } from './kit.js';

const START = 0.62; // 滑らせ始める位置(中央からの距離)
const REACH = 1.5; // パワー 1 で滑る距離
const EDGE = 0.74; // これより向こうに出たら落ちる
const SWEET = START / REACH; // ちょうど中心に止まるパワー(約 0.41)
const PERIOD = 1.05; // メーターが 1 往復する秒数
// キャラクターごとのブレ(小さいほど上手い)
const SKILL = [0.07, 0.05, 0.09, 0.06];

const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

function createShotGlass() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0xdde6e8, roughness: 0.05, transparent: true, opacity: 0.45 });
  const pts = [[0, 0], [0.022, 0], [0.024, 0.01], [0.028, 0.06], [0.026, 0.06], [0.021, 0.012], [0, 0.012]].map(([r, y]) => new THREE.Vector2(r, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), glass);
  m.castShadow = true;
  g.add(m);
  const whisky = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x9a5212, roughness: 0.15, transparent: true, opacity: 0.85 }));
  whisky.position.y = 0.028;
  g.add(whisky);
  return g;
}

function createTarget(game) {
  const g = new THREE.Group();
  const chalk = new THREE.MeshBasicMaterial({ color: 0xf2ead8, transparent: true, opacity: 0.55, depthWrite: false });
  for (const [r, w] of [[0.05, 0.006], [0.12, 0.005], [0.2, 0.004]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 48), chalk);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
  }
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), chalk);
  dot.rotation.x = -Math.PI / 2;
  g.add(dot);
  g.position.copy(game.tablePos).setY(game.tableTop + 0.0015);
  return g;
}

export class ShotSlide {
  constructor(scene) {
    this.scene = scene;
    this.title = 'ショット・スライド';
    this.firstTime = true;
    this.objects = [];
  }

  cleanup(game) {
    for (const o of this.objects) o.parent?.remove(o);
    this.objects = [];
    const box = game?.ui.choices;
    if (box) {
      box.innerHTML = '';
      box.style.display = 'none';
    }
  }

  // プレイヤー:メーターを表示して、止めた強さ(0〜1)を返す
  async meter(game) {
    const box = game.ui.choices;
    box.innerHTML = `
      <div class="meter"><div class="sweet"></div><div class="needle"></div></div>
      <button class="big">🥃 止める!</button>`;
    const sweet = box.querySelector('.sweet');
    sweet.style.left = `${(SWEET - 0.035) * 100}%`;
    sweet.style.width = `${0.07 * 100}%`;
    const needle = box.querySelector('.needle');
    const btn = box.querySelector('button');
    box.style.display = '';
    document.exitPointerLock?.();
    let stopped = null;
    const t0 = game.clock;
    const value = () => (1 - Math.cos(((game.clock - t0) / PERIOD) * Math.PI * 2)) / 2;
    const stop = () => {
      if (stopped === null) stopped = value();
    };
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        stop();
      }
    };
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      stop();
    });
    window.addEventListener('keydown', onKey);
    this._stop = stop;
    while (stopped === null) {
      needle.style.left = `${value() * 100}%`;
      await game.wait(1 / 30);
    }
    needle.style.left = `${stopped * 100}%`;
    btn.classList.add('pressed');
    btn.textContent = '✔';
    window.removeEventListener('keydown', onKey);
    this._stop = null;
    await game.wait(0.3);
    box.innerHTML = '';
    box.style.display = 'none';
    return stopped;
  }

  // グラスを滑らせて、中心からの距離を返す(落ちたら Infinity)
  async slide(game, p, power, lane) {
    const { dir } = seatFrame(game, p.seat);
    const glass = createShotGlass();
    this.scene.add(glass);
    this.objects.push(glass);
    const s0 = START;
    const s1 = START - power * REACH; // 止まる位置(中央からの符号付き距離。負なら向こう側)
    const from = tableSpot(game, p.seat, s0, lane);
    glass.position.copy(from);
    game.sfx.slide?.(0.9, 0.3);
    const fall = s1 < -EDGE;
    const end = fall ? -EDGE - 0.05 : s1;
    await game.tween(0.6 + power * 0.7, (t) => {
      const s = s0 + (end - s0) * easeOut(t);
      glass.position.copy(tableSpot(game, p.seat, s, lane));
    });
    if (fall) {
      // 向こう側の縁から落ちる
      const a = glass.position.clone();
      const b = a.clone().addScaledVector(dir, -0.35);
      b.y = 0.02;
      await game.tween(0.45, (t) => {
        glass.position.lerpVectors(a, b, t);
        glass.position.y = a.y + (b.y - a.y) * t * t;
        glass.rotation.x = t * 2;
      });
      game.sfx.click();
      return Infinity;
    }
    const pos = glass.position.clone().setY(0);
    return pos.distanceTo(V(game.tablePos.x, 0, game.tablePos.z));
  }

  async play(game) {
    const alive = shuffle(game.players.filter((p) => p.alive));
    game.say(
      this.firstTime
        ? 'ショット・スライド:メーターを止めて、グラスを中央の的へ滑らせろ。\n金色の所がちょうど良い強さ。強すぎると落ちる。的から一番遠い者が撃つ。'
        : 'ショット・スライド:的の真ん中を狙え',
    );
    await game.wait(this.firstTime ? 4.6 : 2.0);
    this.firstTime = false;
    const target = createTarget(game);
    this.scene.add(target);
    this.objects.push(target);

    const dist = new Map();
    const fmt = (d) => (d === Infinity ? '落下' : `${Math.round(d * 100)}cm`);
    for (let i = 0; i < alive.length; i++) {
      const p = alive[i];
      game.say(`${label(game, p)} の番`);
      game.controls.setFocus(isMe(game, p) ? game.tablePos.clone().setY(game.tableTop) : p.character.userData.head.getWorldPosition(new THREE.Vector3()));
      for (const o of alive) o.character.userData.focus = game.tablePos.clone().setY(game.tableTop);
      await game.wait(0.9);
      let power;
      if (isMe(game, p)) {
        game.say('メーターが金色の所で止めろ!');
        power = await this.meter(game);
      } else {
        await game.wait(0.6 + Math.random() * 0.6);
        power = Math.min(1, Math.max(0.05, SWEET + gauss() * SKILL[p.seat]));
        // 押し出す腕の動き
        const u = p.character.userData;
        const arm = u.arms[0];
        arm.controlled = true;
        u.reachTarget = 0.3;
        const fromT = arm.target.clone();
        const toT = p.character.worldToLocal(tableSpot(game, p.seat, 0.5, 0.04, 0.03));
        await game.tween(0.25, (t) => arm.target.lerpVectors(fromT, toT, t));
        arm.controlled = false;
        u.reachTarget = 0;
      }
      const lane = (i - (alive.length - 1) / 2) * 0.035; // 重ならないよう少しずつずらす
      const d = await this.slide(game, p, power, lane);
      dist.set(p.seat, d);
      game.setFloat(p.seat, fmt(d), { color: d === Infinity ? '#ff7a6a' : d < 0.05 ? '#ffd36a' : '#f3e2bd' });
      game.tags = Object.fromEntries([...dist].map(([s, v]) => [s, fmt(v)]));
      game.renderPlayers();
      game.say(d === Infinity ? `${label(game, p)} のグラスが落ちた!` : `${label(game, p)}:中心から ${fmt(d)}`);
      await game.wait(1.4);
    }
    game.clearFocus();
    game.say(`結果:${alive.map((p) => `${label(game, p)} ${fmt(dist.get(p.seat))}`).join(' ・ ')}`);
    await game.wait(2.6);
    // 一番遠い人(cm 単位で比べる)。同じならサイコロ決着
    const cm = (p) => (dist.get(p.seat) === Infinity ? Infinity : Math.round(dist.get(p.seat) * 100));
    const worst = Math.max(...alive.map(cm));
    const tied = alive.filter((p) => cm(p) === worst);
    const loser = tied.length > 1 ? await rollOff(game, tied, worst === Infinity ? '落としたのが複数' : '同じ距離') : tied[0];
    return [loser];
  }
}
