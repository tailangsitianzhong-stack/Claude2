// テーブル・椅子・ピアノ・樽などの家具
import * as THREE from 'three';
import { box, rod, lathe, mesh, scaledBox } from '../materials.js';
import { keyboardTexture } from '../textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 4 人用の丸いポーカーテーブル(直径 約1.6m、高さ 0.76m)
export function createPokerTable(M) {
  const g = new THREE.Group();
  const H = 0.76;
  const R = 0.8;

  // フェルトの天板
  const felt = mesh(new THREE.CylinderGeometry(R - 0.1, R - 0.1, 0.02, 64), M.felt);
  felt.position.y = H - 0.01;
  g.add(felt);

  // 革張りの縁(レール)
  const rail = mesh(new THREE.TorusGeometry(R - 0.05, 0.055, 16, 96), M.leather);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = H + 0.01;
  g.add(rail);

  // 木の縁取り
  const rim = mesh(new THREE.CylinderGeometry(R, R, 0.09, 64, 1, true), M.woodRed);
  rim.position.y = H - 0.05;
  g.add(rim);
  const under = mesh(new THREE.CylinderGeometry(R, R - 0.06, 0.03, 64), M.woodDark);
  under.position.y = H - 0.105;
  g.add(under);
  // 真鍮の飾り線
  const inlay = mesh(new THREE.TorusGeometry(R + 0.002, 0.006, 6, 96), M.brass);
  inlay.rotation.x = Math.PI / 2;
  inlay.position.y = H - 0.07;
  g.add(inlay);

  // 太い支柱(ろくろ挽き)
  lathe(
    g,
    [
      [0, 0.12], [0.2, 0.12], [0.2, 0.16], [0.12, 0.2], [0.09, 0.28], [0.13, 0.36], [0.09, 0.44],
      [0.07, 0.55], [0.1, 0.6], [0.16, 0.64], [0.16, 0.66], [0, 0.66],
    ],
    M.woodRed,
    32,
  );

  // 4 本の猫足
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const foot = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([V(0.1, 0.16, 0), V(0.25, 0.12, 0), V(0.4, 0.06, 0), V(0.47, 0.035, 0)]);
    const leg = mesh(new THREE.TubeGeometry(curve, 20, 0.04, 10), M.woodRed);
    foot.add(leg);
    const ball = mesh(new THREE.SphereGeometry(0.045, 16, 12), M.brass);
    ball.position.set(0.48, 0.035, 0);
    foot.add(ball);
    foot.rotation.y = -a;
    g.add(foot);
  }
  g.userData.height = H;
  g.userData.radius = R;
  return g;
}

// 西部劇の酒場によくある曲げ木の背もたれ椅子。正面は +z
export function createChair(M, { mat = M.woodMid } = {}) {
  const g = new THREE.Group();
  const SH = 0.46; // 座面の高さ
  const SR = 0.22;

  const seat = mesh(new THREE.CylinderGeometry(SR, SR - 0.01, 0.045, 32), mat);
  seat.position.y = SH;
  g.add(seat);

  // 脚(少し外に開く)
  const legAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  for (const a of legAngles) {
    const top = V(Math.cos(a) * 0.15, SH - 0.02, Math.sin(a) * 0.15);
    const bot = V(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
    rod(g, bot, top, 0.016, mat, 0.019);
  }
  // 脚をつなぐ輪
  const ring = mesh(new THREE.TorusGeometry(0.183, 0.01, 8, 40), mat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.17;
  g.add(ring);

  // 背もたれ:後ろ側に湾曲した笠木
  const ARC = Math.PI * 0.9;
  const RR = 0.2;
  const railGeo = new THREE.TorusGeometry(RR, 0.022, 10, 32, ARC);
  railGeo.rotateZ(-Math.PI / 2 - ARC / 2);
  railGeo.rotateX(Math.PI / 2);
  const topRail = mesh(railGeo, mat);
  topRail.position.y = 0.88;
  g.add(topRail);
  const midGeo = new THREE.TorusGeometry(RR, 0.012, 8, 32, ARC);
  midGeo.rotateZ(-Math.PI / 2 - ARC / 2);
  midGeo.rotateX(Math.PI / 2);
  const midRail = mesh(midGeo, mat);
  midRail.position.y = 0.66;
  g.add(midRail);

  // 背柱とスピンドル
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = -Math.PI / 2 - ARC / 2 + ARC * t;
    const x = Math.cos(a) * RR;
    const z = Math.sin(a) * RR;
    const end = i === 0 || i === n - 1;
    rod(g, V(x * 0.95, SH, z * 0.95), V(x, 0.88, z), end ? 0.016 : 0.008, mat, end ? 0.014 : 0.007, 8);
  }
  g.userData.seatHeight = SH;
  return g;
}

// 小さめの四角いテーブル(他の客用)
export function createSquareTable(M, { size = 0.9 } = {}) {
  const g = new THREE.Group();
  const H = 0.75;
  box(g, size, 0.04, size, M.woodMid, 0, H - 0.02, 0, 0.6);
  box(g, size - 0.1, 0.08, size - 0.1, M.woodDark, 0, H - 0.08, 0, 0.6);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = size / 2 - 0.08;
      lathe(
        g,
        [[0, 0], [0.03, 0], [0.028, 0.1], [0.04, 0.16], [0.025, 0.24], [0.03, H - 0.14], [0.04, H - 0.12], [0.04, H - 0.04], [0, H - 0.04]],
        M.woodDark,
        12,
      ).position.set(sx * p, 0, sz * p);
    }
  }
  return g;
}

// 酒瓶
export function createBottle(M, { color = 0x6a3a10, height = 0.3, label = true, fill = 0.7 } = {}) {
  const g = new THREE.Group();
  const s = height / 0.3;
  const glass = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.72,
  });
  const body = lathe(
    g,
    [[0, 0], [0.038, 0], [0.04, 0.01], [0.04, 0.18], [0.034, 0.2], [0.014, 0.235], [0.013, 0.28], [0.016, 0.285], [0.016, 0.3], [0, 0.3]].map(
      ([r, y]) => [r * s, y * s],
    ),
    glass,
    16,
  );
  body.castShadow = true;
  if (fill > 0) {
    const liquid = mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.18 * s * fill, 16), new THREE.MeshStandardMaterial({ color: 0x5a2a06, roughness: 0.2 }), { cast: false });
    liquid.position.y = (0.18 * s * fill) / 2 + 0.005;
    g.add(liquid);
  }
  if (label) {
    const lab = mesh(new THREE.CylinderGeometry(0.0405 * s, 0.0405 * s, 0.07 * s, 16, 1, true), M.paper, { cast: false });
    lab.position.y = 0.1 * s;
    g.add(lab);
  }
  // コルク
  const cork = mesh(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.02 * s, 8), M.woodRaw);
  cork.position.y = 0.305 * s;
  g.add(cork);
  return g;
}

// ショットグラス
export function createGlass(M, { filled = false } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xdde6e8, roughness: 0.05, transparent: true, opacity: 0.35 });
  lathe(g, [[0, 0], [0.024, 0], [0.026, 0.01], [0.03, 0.065], [0.028, 0.065], [0.024, 0.012], [0, 0.012]], mat, 16);
  if (filled) {
    const l = mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x8a4a10, roughness: 0.15, transparent: true, opacity: 0.85 }));
    l.position.y = 0.028;
    g.add(l);
  }
  return g;
}

// 樽
export function createBarrel(M, { height = 0.9, radius = 0.3 } = {}) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = radius * (0.84 + 0.16 * Math.sin(t * Math.PI));
    pts.push([r, t * height]);
  }
  lathe(g, [[0, 0], ...pts, [0, height]], M.woodRaw, 28);
  for (const t of [0.08, 0.3, 0.7, 0.92]) {
    const r = radius * (0.84 + 0.16 * Math.sin(t * Math.PI)) + 0.004;
    const hoop = mesh(new THREE.CylinderGeometry(r, r, 0.035, 28, 1, true), M.iron);
    hoop.position.y = t * height;
    g.add(hoop);
  }
  return g;
}

// 木箱
export function createCrate(M, size = 0.6) {
  const g = new THREE.Group();
  box(g, size, size, size, M.woodRaw, 0, size / 2, 0, 0.5);
  const b = 0.05;
  const s = size + 0.01;
  // 補強の枠
  for (const y of [b / 2, size - b / 2]) {
    box(g, s, b, b, M.woodDark, 0, y, s / 2 - b / 2, 0.5);
    box(g, s, b, b, M.woodDark, 0, y, -s / 2 + b / 2, 0.5);
    box(g, b, b, s, M.woodDark, s / 2 - b / 2, y, 0, 0.5);
    box(g, b, b, s, M.woodDark, -s / 2 + b / 2, y, 0, 0.5);
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) box(g, b, size, b, M.woodDark, (x * (s - b)) / 2, size / 2, (z * (s - b)) / 2, 0.5);
  return g;
}

// 痰壺
export function createSpittoon(M) {
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.1, 0], [0.13, 0.05], [0.12, 0.11], [0.06, 0.15], [0.05, 0.16], [0.11, 0.2], [0.1, 0.205], [0.045, 0.165], [0, 0.165]], M.brass, 24);
  return g;
}

// アップライトピアノ(正面は +z)
export function createPiano(M) {
  const g = new THREE.Group();
  const W = 1.5;
  box(g, W, 1.25, 0.5, M.woodRed, 0, 0.625 + 0.02, 0, 0.8); // 本体
  box(g, W + 0.06, 0.05, 0.56, M.woodDark, 0, 1.29, 0, 0.8); // 天板
  box(g, W - 0.12, 0.5, 0.02, M.woodDark, 0, 1.0, 0.26, 0.8); // 上部前板
  // 前板の装飾パネル
  for (const x of [-0.42, 0, 0.42]) box(g, 0.34, 0.36, 0.015, M.woodRed, x, 1.0, 0.275, 0.5);
  // 鍵盤台
  box(g, W, 0.08, 0.3, M.woodRed, 0, 0.7, 0.36, 0.8);
  const keysMat = new THREE.MeshStandardMaterial({ map: keyboardTexture(), roughness: 0.35 });
  const keys = mesh(new THREE.PlaneGeometry(W - 0.14, 0.15), keysMat, { cast: false });
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.742, 0.4);
  g.add(keys);
  box(g, W - 0.14, 0.05, 0.02, M.woodDark, 0, 0.77, 0.32, 0.5); // 蓋の縁
  // 脚(柱)
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
    box(g, 0.08, 0.06, 0.32, M.woodRed, x, 0.75, 0.36, 0.5);
    lathe(g, [[0, 0], [0.035, 0], [0.03, 0.1], [0.045, 0.3], [0.03, 0.6], [0.035, 0.66], [0, 0.66]], M.woodRed, 14).position.set(x, 0.02, 0.45);
  }
  // ペダル
  for (const x of [-0.08, 0.08]) box(g, 0.03, 0.015, 0.1, M.brass, x, 0.06, 0.3, 0.2);
  // 燭台
  for (const x of [-0.6, 0.6]) {
    const holder = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.03, 12), M.brass);
    holder.position.set(x, 1.12, 0.32);
    g.add(holder);
    const candle = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), M.paper);
    candle.position.set(x, 1.18, 0.32);
    g.add(candle);
  }
  // ピアノ椅子
  const stool = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 24), M.leather);
  top.position.y = 0.5;
  stool.add(top);
  lathe(stool, [[0, 0.1], [0.04, 0.1], [0.03, 0.47], [0.08, 0.47], [0, 0.47]], M.woodRed, 12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    rod(stool, V(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22), V(Math.cos(a) * 0.03, 0.18, Math.sin(a) * 0.03), 0.018, M.woodRed);
  }
  stool.position.set(0.1, 0, 0.85);
  g.add(stool);
  return g;
}

// テーブルにトランプを散らす
export function createCardSpread(M, rng, count = 6) {
  const g = new THREE.Group();
  const back = new THREE.MeshStandardMaterial({ color: 0x8a1c1c, roughness: 0.6 });
  for (let i = 0; i < count; i++) {
    const c = mesh(scaledBox(0.063, 0.002, 0.088), [M.paper, M.paper, back, M.paper, M.paper, M.paper], { cast: false });
    c.position.set((rng() - 0.5) * 0.4, 0.001 + i * 0.002, (rng() - 0.5) * 0.4);
    c.rotation.y = rng() * Math.PI;
    g.add(c);
  }
  return g;
}

export { scaledBox };
