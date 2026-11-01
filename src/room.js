// 部屋(床・壁・天井・窓・扉・照明・装飾)と屋外
import * as THREE from 'three';
import { box, rod, mesh, lathe } from './materials.js';
import { createRng, nightSkyTexture, wantedPosterTexture, clockFaceTexture, plankTexture } from './textures.js';
import { createHangingLamp } from './props/bar.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const ROOM = { W: 16, D: 14, H: 4.2, WAINSCOT: 1.1 };

// 開口部を避けて帯状の壁面を四角形の集まりで作る(UV はメートル基準)
function bandGeometry(L, y0, y1, openings, tileU, tileV, vertical = false) {
  const xs = new Set([-L / 2, L / 2]);
  for (const o of openings) {
    xs.add(Math.max(-L / 2, Math.min(L / 2, o.x0)));
    xs.add(Math.max(-L / 2, Math.min(L / 2, o.x1)));
  }
  const sx = [...xs].sort((a, b) => a - b);
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  const quad = (a, b, p, q) => {
    const base = pos.length / 3;
    for (const [x, y] of [[a, p], [b, p], [b, q], [a, q]]) {
      pos.push(x, y, 0);
      nor.push(0, 0, 1);
      if (vertical) uv.push(y / tileV, x / tileU);
      else uv.push(x / tileU, y / tileV);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < sx.length - 1; i++) {
    const a = sx[i];
    const b = sx[i + 1];
    if (b - a < 1e-4) continue;
    const mid = (a + b) / 2;
    const blocks = openings
      .filter((o) => o.x0 < mid && o.x1 > mid)
      .map((o) => [Math.max(o.y0, y0), Math.min(o.y1, y1)])
      .filter(([p, q]) => q > p)
      .sort((m, n) => m[0] - n[0]);
    let cur = y0;
    for (const [p, q] of blocks) {
      if (p > cur) quad(a, b, cur, p);
      cur = Math.max(cur, q);
    }
    if (cur < y1) quad(a, b, cur, y1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// 開口部で途切れる横長の部材(幅木・腰見切りなど)
function trim(parent, L, y, h, d, openings, mat) {
  const xs = [-L / 2];
  const ends = [];
  const cuts = openings.filter((o) => o.y0 < y + h / 2 && o.y1 > y - h / 2).sort((a, b) => a.x0 - b.x0);
  let cur = -L / 2;
  for (const o of cuts) {
    if (o.x0 - 0.1 > cur) ends.push([cur, o.x0 - 0.1]);
    cur = o.x1 + 0.1;
  }
  if (cur < L / 2) ends.push([cur, L / 2]);
  void xs;
  for (const [a, b] of ends) box(parent, b - a, h, d, mat, (a + b) / 2, y, d / 2, 1);
}

// 窓(壁ローカル座標。+z が室内側)
function addWindow(M, wall, cx, y0, y1, w, rng) {
  const h = y1 - y0;
  const depth = 0.22;
  const cw = 0.12;
  // 額縁
  box(wall, w + cw * 2, cw, 0.04, M.woodDark, cx, y1 + cw / 2, 0.02, 0.5);
  box(wall, cw, h, 0.04, M.woodDark, cx - w / 2 - cw / 2, y0 + h / 2, 0.02, 0.5);
  box(wall, cw, h, 0.04, M.woodDark, cx + w / 2 + cw / 2, y0 + h / 2, 0.02, 0.5);
  box(wall, w + cw * 2 + 0.1, 0.05, 0.14, M.woodDark, cx, y0 - 0.025, 0.05, 0.5); // 窓台
  // 壁の厚み(見込み)
  box(wall, w, 0.02, depth, M.woodMid, cx, y1 - 0.01, -depth / 2, 0.5);
  box(wall, w, 0.02, depth, M.woodMid, cx, y0 + 0.01, -depth / 2, 0.5);
  box(wall, 0.02, h, depth, M.woodMid, cx - w / 2 + 0.01, y0 + h / 2, -depth / 2, 0.5);
  box(wall, 0.02, h, depth, M.woodMid, cx + w / 2 - 0.01, y0 + h / 2, -depth / 2, 0.5);
  // 桟とガラス
  const zf = -depth + 0.05;
  for (const t of [1 / 3, 2 / 3]) box(wall, w, 0.035, 0.04, M.woodDark, cx, y0 + h * t, zf, 0.3);
  box(wall, 0.035, h, 0.04, M.woodDark, cx, y0 + h / 2, zf, 0.3);
  const glass = mesh(new THREE.PlaneGeometry(w, h), M.windowGlass, { cast: false, receive: false });
  glass.position.set(cx, y0 + h / 2, zf - 0.01);
  wall.add(glass);

  // カーテン(波打つ布)
  const curtainH = h + 0.3;
  for (const side of [-1, 1]) {
    const cwid = w * 0.32;
    const geo = new THREE.PlaneGeometry(cwid, curtainH, 16, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const t = (curtainH / 2 - y) / curtainH; // 上 0 → 下 1
      p.setZ(i, Math.sin((x / cwid) * Math.PI * 6 + rng() * 0.2) * 0.025 * (0.6 + t * 0.4));
      // 下に行くほどタッセルで絞られる
      if (t > 0.45 && t < 0.65) p.setX(i, x * (1 - (0.65 - Math.abs(t - 0.55)) * 0.6));
    }
    geo.computeVertexNormals();
    const c = mesh(geo, M.cloth, { cast: false });
    c.position.set(cx + side * (w / 2 + cw - cwid / 2 + 0.06), y1 + 0.2 - curtainH / 2, 0.08);
    wall.add(c);
  }
  // カーテンレールとバランス
  rod(wall, V(cx - w / 2 - 0.3, y1 + 0.24, 0.08), V(cx + w / 2 + 0.3, y1 + 0.24, 0.08), 0.015, M.brass);
  const val = mesh(new THREE.PlaneGeometry(w + 0.5, 0.18, 24, 1), M.cloth, { cast: false });
  const vp = val.geometry.attributes.position;
  for (let i = 0; i < vp.count; i++) vp.setZ(i, Math.sin(vp.getX(i) * 18) * 0.015);
  val.geometry.computeVertexNormals();
  val.position.set(cx, y1 + 0.17, 0.1);
  wall.add(val);
}

// 西部劇のスイングドア(バットウィング)。ヒンジ位置を原点とした 1 枚分
function createBatwing(M, w, side) {
  const g = new THREE.Group();
  const h = 1.15;
  const leaf = new THREE.Group();
  leaf.position.x = (-side * w) / 2;
  const t = 0.035;
  box(leaf, 0.07, h, t, M.woodRed, (side * (w / 2 - 0.035)) * 1, 0, 0, 0.5);
  box(leaf, 0.07, h * 0.8, t, M.woodRed, (-side * (w / 2 - 0.035)) * 1, -h * 0.1, 0, 0.5);
  box(leaf, w, 0.08, t, M.woodRed, 0, -h / 2 + 0.04, 0, 0.5);
  box(leaf, w, 0.06, t, M.woodRed, 0, 0.0, 0, 0.5);
  box(leaf, w, 0.06, t, M.woodRed, 0, h * 0.3 - 0.03, 0, 0.5);
  // ルーバー
  for (let y = -h / 2 + 0.12; y < -0.04; y += 0.06) {
    const s = box(leaf, w - 0.12, 0.05, 0.008, M.woodMid, 0, y, 0, 0.3);
    s.rotation.x = 0.6;
  }
  // 上部の装飾(中央に向かって下がる曲線を段で表現)
  for (let i = 0; i < 6; i++) {
    const f = i / 5;
    const x = side * (w / 2 - 0.035) - side * f * (w - 0.07);
    const top = h * 0.3 + (1 - f * f) * h * 0.2;
    box(leaf, (w - 0.07) / 6 + 0.01, top - (h * 0.3 - 0.03), t * 0.8, M.woodRed, x - side * (w - 0.07) / 12 + side * 0.035 * 0, (top + h * 0.3) / 2 - 0.015, 0, 0.5);
  }
  for (let i = 0; i < 2; i++) {
    const hinge = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8), M.brass);
    hinge.position.set(side * (w / 2), i ? 0.4 : -0.4, 0);
    leaf.add(hinge);
  }
  g.add(leaf);
  return g;
}

// 壁付けのオイルランプ。position: 壁面の点、normal: 室内向き
function createSconce(M) {
  const g = new THREE.Group();
  box(g, 0.1, 0.2, 0.02, M.woodDark, 0, 0, 0.01, 0.3);
  const reflector = mesh(new THREE.CircleGeometry(0.11, 24), M.brass, { cast: false });
  reflector.position.set(0, 0.08, 0.025);
  g.add(reflector);
  rod(g, V(0, -0.05, 0.02), V(0, -0.05, 0.16), 0.008, M.brass);
  lathe(g, [[0, 0], [0.04, 0], [0.055, 0.04], [0.045, 0.07], [0.012, 0.09], [0, 0.09]], M.brass, 16).position.set(0, -0.08, 0.16);
  const chimney = mesh(new THREE.CylinderGeometry(0.022, 0.035, 0.15, 16, 1, true), M.glassLamp, { cast: false });
  chimney.position.set(0, 0.08, 0.16);
  g.add(chimney);
  const flame = mesh(new THREE.SphereGeometry(0.011, 8, 8), M.flame, { cast: false });
  flame.scale.y = 2;
  flame.position.set(0, 0.04, 0.16);
  g.add(flame);
  g.userData.lightLocal = V(0, 0.06, 0.2);
  return g;
}

// 馬車の車輪のシャンデリア
function createWheelChandelier(M, ceilingY, y) {
  const g = new THREE.Group();
  const R = 0.75;
  const wheelMat = M.woodDark;
  const noShadow = (m) => {
    m.castShadow = false;
    return m;
  };
  const rimGeo = new THREE.TorusGeometry(R, 0.04, 10, 64);
  const rim = noShadow(mesh(rimGeo, wheelMat));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = y;
  g.add(rim);
  const tire = noShadow(mesh(new THREE.TorusGeometry(R + 0.03, 0.012, 6, 64), M.iron));
  tire.rotation.x = Math.PI / 2;
  tire.position.y = y;
  g.add(tire);
  const hub = noShadow(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 16), wheelMat));
  hub.position.y = y;
  g.add(hub);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    noShadow(rod(g, V(Math.cos(a) * 0.09, y, Math.sin(a) * 0.09), V(Math.cos(a) * R, y, Math.sin(a) * R), 0.022, wheelMat, 0.016, 8));
  }
  // 鎖
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    noShadow(rod(g, V(Math.cos(a) * R * 0.95, y, Math.sin(a) * R * 0.95), V(0, y + 0.55, 0), 0.006, M.iron));
  }
  noShadow(rod(g, V(0, y + 0.55, 0), V(0, ceilingY, 0), 0.01, M.iron));
  // 縁に並ぶランプ
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 12;
    const lx = Math.cos(a) * R;
    const lz = Math.sin(a) * R;
    const base = noShadow(lathe(g, [[0, 0], [0.05, 0], [0.06, 0.05], [0.04, 0.08], [0.012, 0.1], [0, 0.1]], M.brass, 14));
    base.position.set(lx, y + 0.04, lz);
    const ch = mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.17, 14, 1, true), M.glassLamp, { cast: false });
    ch.position.set(lx, y + 0.22, lz);
    g.add(ch);
    const fl = mesh(new THREE.SphereGeometry(0.012, 8, 8), M.flame, { cast: false });
    fl.scale.y = 2;
    fl.position.set(lx, y + 0.18, lz);
    g.add(fl);
  }
  return g;
}

// 部屋全体を組み立てる
export function buildRoom(scene, M, { shadowSize = 2048 } = {}) {
  const { W, D, H, WAINSCOT } = ROOM;
  const rng = createRng(99);
  const lights = [];
  const room = new THREE.Group();
  scene.add(room);

  // 床
  const floor = mesh(new THREE.PlaneGeometry(W, D), M.floor, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  M.floor.map.repeat.set(W / 2.2, D / 2.2);
  room.add(floor);

  // 天井と梁
  const ceil = mesh(new THREE.PlaneGeometry(W, D), M.ceiling, { cast: false });
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  M.ceiling.map.repeat.set(W / 2.5, D / 2.5);
  room.add(ceil);
  for (let z = -D / 2 + 1.6; z < D / 2; z += 2.4) box(room, W, 0.28, 0.22, M.woodBeam, 0, H - 0.14, z, 1.2);
  box(room, 0.3, 0.32, D, M.woodBeam, 0, H - 0.3, 0, 1.2); // 棟梁

  // 柱
  for (const [x, z] of [[-4.2, -1.8], [4.2, -1.8], [-4.2, 4.2], [4.2, 4.2]]) {
    box(room, 0.24, H, 0.24, M.woodBeam, x, H / 2, z, 1);
    box(room, 0.34, 0.25, 0.34, M.woodDark, x, 0.125, z, 0.5);
    box(room, 0.36, 0.12, 0.36, M.woodDark, x, H - 0.4, z, 0.5);
    // 梁との方杖
    for (const s of [-1, 1]) {
      const br = box(room, 0.1, 0.7, 0.12, M.woodBeam, x + s * 0.3, H - 0.5, z, 0.5);
      br.rotation.z = s * 0.7;
    }
  }

  // 壁の定義(開口部は壁に沿った位置 u で指定)
  const walls = [
    { name: 'back', pos: V(0, 0, -D / 2), rot: 0, L: W, openings: [] },
    {
      name: 'front',
      pos: V(0, 0, D / 2),
      rot: Math.PI,
      L: W,
      openings: [
        { x0: -0.95, x1: 0.95, y0: 0, y1: 2.6, type: 'door' },
        { x0: -5.2, x1: -3.8, y0: 1.2, y1: 2.7, type: 'window' },
        { x0: 3.8, x1: 5.2, y0: 1.2, y1: 2.7, type: 'window' },
      ],
    },
    {
      name: 'left',
      pos: V(-W / 2, 0, 0),
      rot: Math.PI / 2,
      L: D,
      openings: [
        { x0: -5.2, x1: -3.8, y0: 1.2, y1: 2.7, type: 'window' },
        { x0: -1.7, x1: -0.3, y0: 1.2, y1: 2.7, type: 'window' },
      ],
    },
    {
      name: 'right',
      pos: V(W / 2, 0, 0),
      rot: -Math.PI / 2,
      L: D,
      openings: [{ x0: 1.3, x1: 2.7, y0: 1.2, y1: 2.7, type: 'window' }],
    },
  ];

  M.wallpaper.map.repeat.set(1, 1);
  const wallGroups = {};
  for (const w of walls) {
    const g = new THREE.Group();
    g.position.copy(w.pos);
    g.rotation.y = w.rot;
    room.add(g);
    wallGroups[w.name] = g;
    const upper = mesh(bandGeometry(w.L, WAINSCOT, H, w.openings, 0.6, 0.6), M.wallpaper, { cast: false });
    const lower = mesh(bandGeometry(w.L, 0, WAINSCOT, w.openings, 1.8, 1.4, true), M.wainscot, { cast: false });
    g.add(upper, lower);

    // 幅木・腰見切り・回り縁
    trim(g, w.L, 0.09, 0.18, 0.03, w.openings, M.woodDark);
    trim(g, w.L, WAINSCOT, 0.07, 0.05, w.openings, M.woodDark);
    trim(g, w.L, WAINSCOT - 0.06, 0.03, 0.03, w.openings, M.woodMid);
    trim(g, w.L, H - 0.08, 0.16, 0.08, [], M.woodDark);
    // 腰板の縦框
    for (let x = -w.L / 2 + 0.6; x < w.L / 2 - 0.3; x += 0.9) {
      if (w.openings.some((o) => o.y0 < WAINSCOT && x > o.x0 - 0.15 && x < o.x1 + 0.15)) continue;
      box(g, 0.07, WAINSCOT - 0.3, 0.025, M.woodDark, x, 0.18 + (WAINSCOT - 0.3) / 2 + 0.03, 0.012, 0.5);
    }
    for (const o of w.openings) {
      if (o.type === 'window') addWindow(M, g, (o.x0 + o.x1) / 2, o.y0, o.y1, o.x1 - o.x0, rng);
    }
  }

  // 正面入口:枠とスイングドア
  {
    const g = wallGroups.front;
    const dw = 1.9;
    box(g, dw + 0.32, 0.18, 0.06, M.woodDark, 0, 2.69, 0.03, 0.5);
    for (const s of [-1, 1]) {
      box(g, 0.16, 2.6, 0.06, M.woodDark, s * (dw / 2 + 0.08), 1.3, 0.03, 0.5);
      box(g, 0.02, 2.6, 0.22, M.woodMid, s * (dw / 2 - 0.01), 1.3, -0.11, 0.5);
    }
    box(g, dw, 0.02, 0.22, M.woodMid, 0, 2.59, -0.11, 0.5);
    const leafW = dw / 2 - 0.03;
    for (const s of [-1, 1]) {
      const leaf = createBatwing(M, leafW, s);
      leaf.position.set(s * (dw / 2 - 0.01), 1.1, -0.05);
      leaf.rotation.y = s === 1 ? 0.18 : -0.05; // 片方が少し開いている
      g.add(leaf);
    }
  }

  // 裏口(右の壁、閉じた扉)
  {
    const g = wallGroups.right;
    const doorTex = plankTexture({ planks: 6, base: [90, 58, 34], seed: 33, nails: true });
    doorTex.rotation = Math.PI / 2;
    doorTex.repeat.set(1, 1);
    const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.8, bumpMap: doorTex, bumpScale: 1 });
    const x = -4.6;
    box(g, 1.0, 2.15, 0.05, doorMat, x, 1.075, 0.025, 1.2);
    box(g, 1.24, 0.12, 0.06, M.woodDark, x, 2.21, 0.03, 0.5);
    for (const s of [-1, 1]) box(g, 0.12, 2.15, 0.06, M.woodDark, x + s * 0.56, 1.075, 0.03, 0.5);
    for (const y of [0.4, 1.75]) box(g, 0.9, 0.08, 0.02, M.iron, x, y, 0.06, 0.3);
    const knob = mesh(new THREE.SphereGeometry(0.035, 12, 10), M.brass);
    knob.position.set(x + 0.38, 1.0, 0.09);
    g.add(knob);
  }

  // 手配書・時計・角の装飾
  const posters = [
    { wall: 'right', x: 0.0, y: 1.9, name: 'BLACK JACK McCOY', reward: '$500', rot: 0.04 },
    { wall: 'right', x: -0.9, y: 1.75, name: 'THE DALTON KID', reward: '$250', rot: -0.06 },
    { wall: 'left', x: 2.6, y: 1.85, name: 'ONE-EYED SAM', reward: '$1000', rot: 0.03 },
    { wall: 'front', x: -2.2, y: 1.8, name: 'DOC HOLLOWAY', reward: '$300', rot: -0.03 },
  ];
  posters.forEach((p, i) => {
    const mat = new THREE.MeshStandardMaterial({ map: wantedPosterTexture({ name: p.name, reward: p.reward, seed: 13 + i }), roughness: 0.95 });
    const m = mesh(new THREE.PlaneGeometry(0.42, 0.56), mat, { cast: false });
    m.position.set(p.x, p.y, 0.012 + i * 0.001);
    m.rotation.z = p.rot;
    wallGroups[p.wall].add(m);
  });

  {
    // 振り子時計
    const g = wallGroups.right;
    const x = 4.5;
    box(g, 0.4, 0.95, 0.14, M.woodRed, x, 2.3, 0.07, 0.5);
    box(g, 0.46, 0.08, 0.16, M.woodDark, x, 2.81, 0.08, 0.5);
    box(g, 0.46, 0.06, 0.16, M.woodDark, x, 1.8, 0.08, 0.5);
    const face = mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshStandardMaterial({ map: clockFaceTexture(), roughness: 0.6 }), { cast: false });
    face.position.set(x, 2.55, 0.145);
    g.add(face);
    const ring = mesh(new THREE.TorusGeometry(0.155, 0.012, 8, 32), M.brass);
    ring.position.set(x, 2.55, 0.145);
    g.add(ring);
    const pend = new THREE.Group();
    pend.position.set(x, 2.32, 0.15);
    rod(pend, V(0, 0, 0), V(0, -0.36, 0), 0.004, M.brass);
    const bob = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 20), M.brass);
    bob.rotation.x = Math.PI / 2;
    bob.position.y = -0.38;
    pend.add(bob);
    g.add(pend);
    scene.userData.pendulum = pend;
  }

  {
    // 入口の上のロングホーン(牛の角)
    const g = wallGroups.front;
    const skull = mesh(new THREE.SphereGeometry(0.12, 16, 12), M.paper);
    skull.scale.set(1, 1.3, 0.6);
    skull.position.set(0, 3.2, 0.08);
    g.add(skull);
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.5 });
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([V(s * 0.08, 3.28, 0.08), V(s * 0.35, 3.3, 0.12), V(s * 0.65, 3.4, 0.1), V(s * 0.8, 3.58, 0.08)]);
      const geo = new THREE.TubeGeometry(curve, 24, 0.035, 10);
      // 先端に向かって細くする
      const p = geo.attributes.position;
      const center = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        const seg = Math.floor(i / 11) / 24;
        curve.getPointAt(Math.min(1, seg), center);
        const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).sub(center).multiplyScalar(1 - seg * 0.8).add(center);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      g.add(mesh(geo, hornMat));
    }
  }

  // ─── 照明 ───
  // シャンデリア(ポーカーテーブルの真上)
  const tablePos = V(0, 0, 1.0);
  const chandelier = createWheelChandelier(M, H, 3.2);
  chandelier.position.set(tablePos.x, 0, tablePos.z);
  room.add(chandelier);
  const main = new THREE.PointLight(0xffb066, 38, 0, 2);
  main.position.set(tablePos.x, 3.05, tablePos.z);
  main.castShadow = true;
  main.shadow.mapSize.set(shadowSize, shadowSize);
  main.shadow.bias = -0.0015;
  main.shadow.normalBias = 0.02;
  main.shadow.radius = 4;
  main.shadow.camera.near = 0.1;
  main.shadow.camera.far = 16;
  room.add(main);
  lights.push({ light: main, base: main.intensity, speed: 1 });

  // バーの吊りランプ
  for (const x of [-3.2, 1.2]) {
    const lamp = createHangingLamp(M, H, 2.55);
    lamp.position.set(x, 0, -4.9);
    room.add(lamp);
    const l = new THREE.PointLight(0xffa850, 12, 9, 2);
    l.position.set(x, 2.6, -4.9);
    room.add(l);
    lights.push({ light: l, base: l.intensity, speed: 1.3 });
  }

  // 壁のランプ(壁ローカル座標で配置)
  const sconces = [
    ['left', -2.9, 2.1],
    ['left', 1.8, 2.1],
    ['left', 5.6, 2.1],
    ['right', -2.0, 2.1],
    ['right', 0.0 + 3.6, 2.1],
    ['front', -1.6, 2.1],
    ['front', 1.6, 2.1],
  ];
  for (const [wn, x, y] of sconces) {
    const s = createSconce(M);
    s.position.set(x, y, 0);
    wallGroups[wn].add(s);
    s.updateWorldMatrix(true, false);
    const lp = s.userData.lightLocal.clone().applyMatrix4(s.matrixWorld);
    const l = new THREE.PointLight(0xff9e48, 5, 7, 2);
    l.position.copy(lp);
    room.add(l);
    lights.push({ light: l, base: l.intensity, speed: 1.6 + rng() });
  }

  // 全体のわずかな環境光(暗部が真っ黒にならないように)
  room.add(new THREE.HemisphereLight(0x8a6a50, 0x20140a, 0.35));

  // 月明かり(窓の外から入る青い光)
  const moon = new THREE.SpotLight(0x6a80b0, 18, 14, 0.5, 0.8, 2);
  moon.position.set(-10.5, 4.5, 2.5);
  moon.target.position.set(-5, 0, 2.5);
  room.add(moon, moon.target);

  buildOutside(scene, M);
  return { lights, tablePos, wallGroups };
}

// 窓や入口から見える屋外
function buildOutside(scene, M) {
  const sky = nightSkyTexture({ horizon: 0.25 });
  const skyMat = new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false });
  const topMat = new THREE.MeshBasicMaterial({ color: 0x03050c, side: THREE.BackSide, fog: false });
  const skyBox = new THREE.Mesh(new THREE.BoxGeometry(90, 40, 90), [skyMat, skyMat, topMat, topMat, skyMat, skyMat]);
  skyBox.position.y = 10;
  scene.add(skyBox);

  const ground = mesh(new THREE.PlaneGeometry(90, 90), M.dirt, { cast: false });
  M.dirt.map.repeat.set(30, 30);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  // 入口前のウッドデッキと庇
  const porchTex = plankTexture({ planks: 8, base: [100, 72, 46], seed: 51 });
  porchTex.rotation = Math.PI / 2;
  porchTex.repeat.set(3, 3);
  const porchMat = new THREE.MeshStandardMaterial({ map: porchTex, roughness: 0.9 });
  const porch = new THREE.Group();
  scene.add(porch);
  box(porch, 18, 0.12, 2.6, porchMat, 0, 0.0, 7 + 1.3, 3);
  for (const x of [-7.5, -2.5, 2.5, 7.5]) box(porch, 0.16, 3.0, 0.16, M.woodBeam, x, 1.5, 9.4, 1);
  box(porch, 18, 0.12, 2.8, M.woodBeam, 0, 3.05, 8.4, 2);
  // 馬をつなぐ横木
  box(porch, 3, 0.1, 0.1, M.woodBeam, -4.5, 0.9, 10.4, 1);
  for (const x of [-5.9, -3.1]) box(porch, 0.12, 0.9, 0.12, M.woodBeam, x, 0.45, 10.4, 1);

  // 通りの向かいの建物
  const across = new THREE.Group();
  scene.add(across);
  const facadeMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });
  box(across, 10, 6, 4, facadeMat, -2, 3, 22, 3);
  box(across, 7, 4.5, 4, facadeMat, 8, 2.25, 21, 3);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  for (const [x, y] of [[-5, 1.6], [-1, 1.6], [2, 4.2], [7, 1.8]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.3), winMat);
    w.position.set(x, y, 19.98);
    w.rotation.y = Math.PI;
    across.add(w);
  }
  const glow = new THREE.PointLight(0xff9040, 8, 12, 2);
  glow.position.set(-3, 2, 18.5);
  scene.add(glow);
}
