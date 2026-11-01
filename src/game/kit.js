// ミニゲーム共通の部品:席まわりの位置、サイコロ、トランプ、チップ、同点時のサイコロ決着
import * as THREE from 'three';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t) => 1 - (1 - t) ** 3;

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const label = (game, p) => (p.seat === game.playerSeat ? 'あなた' : game.presets[p.seat].short);
export const isMe = (game, p) => p.seat === game.playerSeat && !game.playerDead;

// 席から見た向き:dir = テーブル中央 → 席、right = 席に座った人の右手側
export function seatFrame(game, seat) {
  const ch = game.players[seat].character;
  const dir = ch.position.clone().sub(game.tablePos).setY(0).normalize();
  const right = V(dir.z, 0, -dir.x);
  return { dir, right, yaw: Math.atan2(dir.x, dir.z) };
}

// テーブル上の位置(中央から dist、席の人から見て右へ lateral)
export function tableSpot(game, seat, dist, lateral = 0, h = 0) {
  const { dir, right } = seatFrame(game, seat);
  const p = game.tablePos.clone().addScaledVector(dir, dist).addScaledVector(right, lateral);
  p.y = game.tableTop + h;
  return p;
}

// 同時に進む非同期処理を、順番をずらして実行する
export async function staggered(items, gap, game, fn) {
  await Promise.all(
    items.map(async (it, i) => {
      await game.wait(i * gap);
      await fn(it, i);
    }),
  );
}

// ─── サイコロ ───
const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};
const dieMats = {};
function dieFace(v) {
  if (dieMats[v]) return dieMats[v];
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = v === 1 ? '#a8161a' : '#1a1410';
  for (const [x, y] of PIPS[v]) {
    ctx.beginPath();
    ctx.arc(x * s, y * s, v === 1 ? 17 : 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  dieMats[v] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 });
  return dieMats[v];
}
// 面の順: +x, -x, +y, -y, +z, -z に 3,4,1,6,2,5(向かい合う面の和が 7)
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = { 3: V(1, 0, 0), 4: V(-1, 0, 0), 1: V(0, 1, 0), 6: V(0, -1, 0), 2: V(0, 0, 1), 5: V(0, 0, -1) };
export const DIE_SIZE = 0.03;

export function createDie() {
  const geo = new THREE.BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE);
  const m = new THREE.Mesh(geo, FACE_VALUES.map(dieFace));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// サイコロを from から to(テーブル上)へ転がし、value の目を上にして止める
export async function rollDie(game, die, value, from, to, dur = 0.9) {
  if (!die.parent) game.scene.add(die);
  const yaw = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.random() * Math.PI * 2);
  const finalQ = yaw.multiply(new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[value], V(0, 1, 0)));
  const axis = V(Math.random() - 0.5, 0.3, Math.random() - 0.5).normalize();
  const spins = 2 + Math.random() * 2;
  game.sfx.dice?.(dur);
  const end = to.clone();
  end.y = game.tableTop + DIE_SIZE / 2;
  await game.tween(dur, (t) => {
    const e = easeOut(t);
    die.position.lerpVectors(from, end, e);
    die.position.y += Math.abs(Math.sin(e * Math.PI * 2.5)) * 0.08 * (1 - e);
    const spin = new THREE.Quaternion().setFromAxisAngle(axis, spins * Math.PI * 2 * (1 - e));
    die.quaternion.copy(spin.multiply(finalQ));
  });
}

// ─── トランプ(52 枚) ───
export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_ORDER = { '♠': 4, '♥': 3, '♦': 2, '♣': 1 };
export const RANK_LABEL = (r) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[r] ?? String(r);
export const cardName = (c) => `${RANK_LABEL(c.r)}${c.s}`;

export function makeDeck() {
  return shuffle(SUITS.flatMap((s) => Array.from({ length: 13 }, (_, i) => ({ r: i + 1, s }))));
}

const faceTex = {};
function cardFace(c) {
  const key = cardName(c);
  if (faceTex[key]) return faceTex[key];
  const w = 256;
  const h = 360;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f3ead6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#7a5a3a';
  ctx.lineWidth = 5;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  const red = c.s === '♥' || c.s === '♦';
  ctx.fillStyle = red ? '#a8161a' : '#16120e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 140px Georgia, "Times New Roman", serif';
  ctx.fillText(RANK_LABEL(c.r), w / 2, h / 2 - 24);
  ctx.font = '90px "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif';
  ctx.fillText(c.s, w / 2, h / 2 + 92);
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText(RANK_LABEL(c.r), 40, 40);
  ctx.font = '32px "DejaVu Sans", sans-serif';
  ctx.fillText(c.s, 40, 80);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  faceTex[key] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  return faceTex[key];
}
let backMat = null;
function cardBack() {
  if (backMat) return backMat;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 360;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f3ead6';
  ctx.fillRect(0, 0, 256, 360);
  ctx.fillStyle = '#5a1414';
  ctx.fillRect(14, 14, 228, 332);
  ctx.strokeStyle = 'rgba(230,190,120,0.55)';
  ctx.lineWidth = 3;
  for (let i = -360; i < 600; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 14);
    ctx.lineTo(i + 330, 346);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d8b25a';
  ctx.lineWidth = 5;
  ctx.strokeRect(24, 24, 208, 312);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  backMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  return backMat;
}
const edgeMat = new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: 0.8 });

// テーブルに寝かせたカード。faceUp=false なら伏せた状態で作る
export function createCard(c, faceUp = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.0016, 0.1), [edgeMat, edgeMat, cardFace(c), cardBack(), edgeMat, edgeMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  pivot.rotation.z = faceUp ? 0 : Math.PI;
  const g = new THREE.Group();
  g.add(pivot);
  g.userData = { pivot, card: c, faceUp };
  return g;
}

// 山札(テーブル中央)から席の前へ配る。index 番目を横に並べる
export async function dealCard(game, card, seat, index, count, { dist = 0.45, faceUp = false, dur = 0.4 } = {}) {
  const { yaw } = seatFrame(game, seat);
  const lateral = (index - (count - 1) / 2) * 0.085;
  const to = tableSpot(game, seat, dist, lateral, 0.0012 + index * 0.0004);
  const from = game.tablePos.clone().setY(game.tableTop + 0.03);
  card.rotation.y = yaw;
  card.position.copy(from);
  if (!card.parent) game.scene.add(card);
  game.sfx.card();
  await game.tween(dur, (t) => {
    const e = easeInOut(t);
    card.position.lerpVectors(from, to, e);
    card.position.y += Math.sin(Math.PI * e) * 0.05;
  });
  if (faceUp) await flipCard(game, card, true);
}

export async function flipCard(game, card, up = true, dur = 0.35) {
  const pv = card.userData.pivot;
  const a0 = pv.rotation.z;
  const a1 = up ? 0 : Math.PI;
  card.userData.faceUp = up;
  await game.tween(dur, (t) => {
    const e = easeInOut(t);
    pv.rotation.z = a0 + (a1 - a0) * e;
    pv.position.y = Math.sin(Math.PI * e) * 0.04;
  });
}

// ─── チップ ───
const chipMats = {};
export function createChip(color = 0xb02a2a) {
  chipMats[color] ??= [
    new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45 }),
  ];
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 24), [chipMats[color][0], chipMats[color][1], chipMats[color][1]]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ─── 同点決着 ───
// 同点の人たちがサイコロを 1 つずつ振り、一番小さい目の人が最下位(また同点なら振り直し)
export async function rollOff(game, tied, why = '同点') {
  let group = [...tied];
  const dice = [];
  let first = true;
  while (group.length > 1) {
    game.say(`${first ? why + '。' : 'また同点。'}${group.map((p) => label(game, p)).join(' と ')} がサイコロで決着をつける(小さい目が負け)`);
    first = false;
    await game.wait(1.8);
    for (const d of dice) d.parent?.remove(d);
    dice.length = 0;
    const vals = new Map();
    await staggered(group, 0.25, game, async (p) => {
      const v = 1 + Math.floor(Math.random() * 6);
      vals.set(p.seat, v);
      const die = createDie();
      dice.push(die);
      const from = tableSpot(game, p.seat, 0.55, 0, 0.12);
      const to = tableSpot(game, p.seat, 0.3, (Math.random() - 0.5) * 0.08);
      await rollDie(game, die, v, from, to);
      game.setFloat(p.seat, `🎲 ${v}`);
    });
    const low = Math.min(...vals.values());
    game.say(group.map((p) => `${label(game, p)} ${vals.get(p.seat)}`).join(' ・ '));
    await game.wait(1.8);
    group = group.filter((p) => vals.get(p.seat) === low);
  }
  await game.wait(0.3);
  for (const d of dice) d.parent?.remove(d);
  for (const p of tied) game.setFloat(p.seat, null);
  return group[0];
}

// 値が一番小さい人(複数ならサイコロ決着)を最下位として返す
export async function lowestLoses(game, players, valueOf, why) {
  const low = Math.min(...players.map(valueOf));
  const tied = players.filter((p) => valueOf(p) === low);
  if (tied.length === 1) return tied[0];
  return rollOff(game, tied, why);
}
