import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { buildRoom, ROOM } from './room.js';
import { createPokerTable, createChair, createSquareTable, createPiano, createBarrel, createCrate, createBottle, createGlass, createCardSpread } from './props/furniture.js';
import { createBarCounter, createBackBar } from './props/bar.js';
import { SeatControls } from './controls.js';
import { createRevolver, createCartridge } from './props/revolver.js';
import { createCharacter, updateCharacter, CHARACTER_PRESETS } from './props/character.js';
import { createRng } from './textures.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0705);
scene.fog = new THREE.FogExp2(0x1c120a, 0.035);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.03, 120);

const M = createMaterials();
const { lights, tablePos } = buildRoom(scene, M);
const rng = createRng(2024);

// ─── ポーカーテーブルと 4 脚の椅子 ───
const table = createPokerTable(M);
table.position.copy(tablePos);
scene.add(table);

const SEAT_R = 1.02;
const seats = [];
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2;
  const p = new THREE.Vector3(tablePos.x + Math.sin(a) * SEAT_R, 0, tablePos.z + Math.cos(a) * SEAT_R);
  const chair = createChair(M);
  chair.position.copy(p);
  chair.rotation.y = Math.atan2(tablePos.x - p.x, tablePos.z - p.z);
  scene.add(chair);
  // 目の高さ(座面 0.46m + 座高)
  const EYE_R = SEAT_R + 0.06;
  const eye = new THREE.Vector3(tablePos.x + Math.sin(a) * EYE_R, 1.22, tablePos.z + Math.cos(a) * EYE_R);
  const yaw = Math.atan2(-(tablePos.x - eye.x), -(tablePos.z - eye.z));
  seats.push({ eye, yaw, chairPos: p.clone(), chairRot: chair.rotation.y });
}

// ─── テーブル中央のリボルバーと弾 ───
const revolver = createRevolver();
revolver.rotation.set(-Math.PI / 2, 0, 0); // 横向きに寝かせる
const revolverHolder = new THREE.Group();
revolverHolder.add(revolver);
revolverHolder.position.set(tablePos.x + 0.02, table.userData.height + 0.0165, tablePos.z + 0.03);
revolverHolder.rotation.y = 0.55;
scene.add(revolverHolder);
const bullet = createCartridge();
bullet.position.set(tablePos.x - 0.16, table.userData.height, tablePos.z + 0.1);
scene.add(bullet);

// ─── 対戦相手(プレイヤーの席以外に座る) ───
const characters = CHARACTER_PRESETS.map((preset, i) => {
  const c = createCharacter(preset);
  c.position.copy(seats[i].chairPos);
  c.rotation.y = seats[i].chairRot;
  scene.add(c);
  return c;
});
const revolverWorld = revolverHolder.position.clone();

// テーブルのフェルトからの照り返し(顔を下から少し照らす)
const bounce = new THREE.PointLight(0xffc890, 2.2, 2.6, 2);
bounce.position.set(tablePos.x, table.userData.height + 0.35, tablePos.z);
scene.add(bounce);


// ─── バー ───
const counter = createBarCounter(M, { L: 8 });
counter.position.set(-1, 0, -4.9);
scene.add(counter);
const backBar = createBackBar(M, { L: 8 });
backBar.position.set(-1, 0, -ROOM.D / 2 + 0.25);
scene.add(backBar);

// ─── 他の客席 ───
function sideTable(x, z, rotY, chairs) {
  const t = createSquareTable(M);
  t.position.set(x, 0, z);
  t.rotation.y = rotY;
  scene.add(t);
  for (const c of chairs) {
    const ch = createChair(M, { mat: M.woodDark });
    const a = c.a + rotY;
    ch.position.set(x + Math.sin(a) * 0.7, 0, z + Math.cos(a) * 0.7);
    ch.rotation.y = a + Math.PI + (c.turn ?? 0);
    if (c.fallen) {
      // 倒れた椅子
      ch.rotation.set(0, a + 2.4, 0);
      ch.position.set(x + Math.sin(a) * 1.25, 0.2, z + Math.cos(a) * 1.25);
      ch.rotateX(-Math.PI / 2 + 0.08);
    }
    scene.add(ch);
  }
  return t;
}
const t1 = sideTable(-5.6, 3.2, 0.3, [{ a: 0 }, { a: Math.PI / 2, turn: 0.4 }, { a: Math.PI, fallen: true }]);
const cards = createCardSpread(M, rng, 7);
cards.position.set(0, 0.75, 0);
t1.add(cards);
const tb = createBottle(M, { fill: 0.25 });
tb.position.set(0.25, 0.75, -0.2);
t1.add(tb);
const t2 = sideTable(5.4, 3.8, -0.2, [{ a: Math.PI / 2 }, { a: -Math.PI / 2, turn: -0.3 }]);
for (const [x, z] of [[0.15, 0.1], [-0.2, -0.05]]) {
  const gl = createGlass(M, { filled: true });
  gl.position.set(x, 0.75, z);
  t2.add(gl);
}
sideTable(5.6, -0.6, 0.1, [{ a: 0 }, { a: Math.PI }]);

// ─── ピアノ(左の壁際) ───
const piano = createPiano(M);
piano.position.set(-ROOM.W / 2 + 0.3, 0, -3.6);
piano.rotation.y = Math.PI / 2;
scene.add(piano);

// ─── 樽と木箱(右奥) ───
for (const [x, z, r] of [[7.3, -6.3, 0], [6.6, -6.4, 0.5], [7.3, -5.6, 1]]) {
  const b = createBarrel(M);
  b.position.set(x, 0, z);
  b.rotation.y = r;
  scene.add(b);
}
const topBarrel = createBarrel(M, { height: 0.7, radius: 0.24 });
topBarrel.position.set(7.0, 0.9, -6.2);
scene.add(topBarrel);
for (const [x, z, y, r, s] of [[5.7, -6.4, 0, 0.1, 0.6], [5.7, -6.4, 0.6, 0.5, 0.45], [7.3, 6.2, 0, 0.3, 0.6]]) {
  const c = createCrate(M, s);
  c.position.set(x, y, z);
  c.rotation.y = r;
  scene.add(c);
}

// ─── 舞い上がる埃 ───
const dustCount = 700;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) {
  dustPos[i * 3] = (rng() - 0.5) * 10;
  dustPos[i * 3 + 1] = rng() * ROOM.H;
  dustPos[i * 3 + 2] = (rng() - 0.5) * 10 + 0.5;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,230,190,1)');
  g.addColorStop(1, 'rgba(255,230,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({ size: 0.012, map: dustTex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffcf9a }),
);
scene.add(dust);

// ─── 操作 ───
const controls = new SeatControls(camera, canvas, seats, {
  min: new THREE.Vector3(-ROOM.W / 2 + 0.3, 0.3, -ROOM.D / 2 + 0.3),
  max: new THREE.Vector3(ROOM.W / 2 - 0.3, ROOM.H - 0.3, ROOM.D / 2 - 0.3),
});
const status = document.getElementById('status');
const updateStatus = () => {
  characters.forEach((c, i) => (c.visible = controls.mode === 'free' || i !== controls.seatIndex));
  status.textContent = controls.mode === 'seat' ? `席 ${controls.seatIndex + 1} に着席中` : '自由移動モード';
};
controls.onChange = updateStatus;
updateStatus();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 確認用(開発時にコンソールから視点を動かせる)
window.__saloon = {
  controls,
  camera,
  setView(pos, target) {
    controls.mode = 'free';
    camera.position.set(...pos);
    camera.lookAt(new THREE.Vector3(...target));
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    controls.freeYaw = e.y;
    controls.freePitch = e.x;
    updateStatus();
  },
  renderer,
  characters,
  revolver: revolverHolder,
};

// ─── ループ ───
const clock = new THREE.Clock();
let t = 0;
function frame(dt) {
  t += dt;
  controls.update(dt);

  // 炎の揺らぎ
  for (const [i, l] of lights.entries()) {
    const n = Math.sin(t * 7.1 * l.speed + i) * 0.5 + Math.sin(t * 13.7 * l.speed + i * 2.3) * 0.3 + Math.sin(t * 2.3 + i) * 0.2;
    l.light.intensity = l.base * (1 + n * 0.06);
  }
  // キャラクターの待機モーション
  const lookTargets = [camera.position, revolverWorld, revolverWorld, ...characters.map((c) => c.userData.head.getWorldPosition(new THREE.Vector3()))];
  for (const c of characters) if (c.visible) updateCharacter(c, t, dt, lookTargets);
  // 振り子
  if (scene.userData.pendulum) scene.userData.pendulum.rotation.z = Math.sin(t * Math.PI) * 0.15;
  // 埃の漂い
  const p = dustGeo.attributes.position;
  for (let i = 0; i < dustCount; i++) {
    let y = p.getY(i) + dt * 0.03 * (0.3 + ((i * 7) % 10) / 10);
    if (y > ROOM.H) y = 0;
    p.setY(i, y);
    p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.02);
  }
  p.needsUpdate = true;

  renderer.render(scene, camera);
}

// ?still を付けると自動描画を止め、__saloon.renderOnce() で 1 枚ずつ描く(確認用)
if (new URLSearchParams(location.search).has('still')) {
  window.__saloon.renderOnce = (steps = 60) => {
    for (let i = 0; i < steps - 1; i++) controls.update(1 / 30);
    frame(1 / 30);
  };
} else {
  renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.05)));
}
