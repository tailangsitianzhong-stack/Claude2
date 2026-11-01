// バーカウンターと酒棚(鏡付き)
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { box, rod, mesh, lathe } from '../materials.js';
import { createBottle, createGlass, createSpittoon } from './furniture.js';
import { signTexture, createRng } from '../textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// カウンター本体。中心 (cx, cz)、長さ L。客側は +z
export function createBarCounter(M, { L = 8 } = {}) {
  const g = new THREE.Group();
  const H = 1.1;
  const D = 0.6;

  box(g, L, 0.12, D - 0.04, M.woodDark, 0, 0.06, 0, 1); // 幅木
  box(g, L, H - 0.18, D, M.woodRed, 0, 0.12 + (H - 0.18) / 2, 0, 1); // 胴
  box(g, L + 0.2, 0.07, 0.8, M.woodRed, 0, H - 0.035, 0.1, 1); // 天板
  box(g, L + 0.22, 0.03, 0.82, M.woodDark, 0, H - 0.085, 0.1, 1); // 天板下の縁
  // 天板の丸い前縁
  const nose = mesh(new THREE.CylinderGeometry(0.045, 0.045, L + 0.2, 16), M.woodRed);
  nose.rotation.z = Math.PI / 2;
  nose.position.set(0, H - 0.045, 0.5);
  g.add(nose);

  // 前面の羽目板と柱
  const seg = Math.round(L / 0.8);
  const sw = L / seg;
  const fz = D / 2;
  for (let i = 0; i < seg; i++) {
    const x = -L / 2 + sw * (i + 0.5);
    box(g, sw - 0.2, 0.55, 0.03, M.woodRed, x, 0.6, fz + 0.015, 0.6);
    box(g, sw - 0.26, 0.49, 0.02, M.woodDark, x, 0.6, fz + 0.035, 0.6);
  }
  for (let i = 0; i <= seg; i++) {
    const x = -L / 2 + sw * i;
    box(g, 0.1, H - 0.2, 0.06, M.woodDark, x, 0.12 + (H - 0.2) / 2, fz + 0.03, 0.6);
  }
  box(g, L, 0.05, 0.05, M.woodDark, 0, 0.95, fz + 0.03, 1);
  box(g, L, 0.05, 0.05, M.woodDark, 0, 0.25, fz + 0.03, 1);
  // 側面
  for (const sx of [-1, 1]) box(g, 0.04, H - 0.18, D, M.woodDark, sx * (L / 2 + 0.02), 0.12 + (H - 0.18) / 2, 0, 1);

  // 真鍮のフットレール
  const rail = mesh(new THREE.CylinderGeometry(0.025, 0.025, L - 0.1, 16), M.brass);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 0.2, fz + 0.25);
  g.add(rail);
  for (let x = -L / 2 + 0.3; x <= L / 2 - 0.2; x += 1.2) {
    rod(g, V(x, 0.2, fz + 0.25), V(x, 0.05, fz + 0.05), 0.012, M.brass);
  }

  // カウンター上の小物
  const rng = createRng(42);
  const glasses = [[-3.2, 0.25], [-3.05, 0.3], [-1.2, 0.2], [0.9, 0.28], [1.05, 0.18], [2.6, 0.25]];
  for (const [x, z] of glasses) {
    const gl = createGlass(M, { filled: rng() < 0.6 });
    gl.position.set(x, H, z);
    g.add(gl);
  }
  const b = createBottle(M, { color: 0x4a2a0a, fill: 0.4 });
  b.position.set(-1.0, H, 0.15);
  g.add(b);
  const b2 = createBottle(M, { color: 0x2a3a1a, fill: 0.8, height: 0.32 });
  b2.position.set(2.8, H, 0.1);
  g.add(b2);

  // 痰壺
  for (const x of [-2.6, 1.4]) {
    const s = createSpittoon(M);
    s.position.set(x, 0, fz + 0.45);
    g.add(s);
  }
  return g;
}

// 酒棚(壁際)。背面が -z、正面が +z
export function createBackBar(M, { L = 8, mirror: realMirror = true } = {}) {
  const g = new THREE.Group();
  const D = 0.5;
  const BH = 0.95;

  // 下段のキャビネット
  box(g, L, BH, D, M.woodRed, 0, BH / 2, 0, 1);
  box(g, L + 0.1, 0.05, D + 0.06, M.woodDark, 0, BH + 0.025, 0.03, 1);
  const doors = 8;
  const dw = L / doors;
  for (let i = 0; i < doors; i++) {
    const x = -L / 2 + dw * (i + 0.5);
    box(g, dw - 0.08, BH - 0.2, 0.02, M.woodDark, x, BH / 2 + 0.03, D / 2 + 0.01, 0.6);
    box(g, dw - 0.18, BH - 0.32, 0.02, M.woodRed, x, BH / 2 + 0.03, D / 2 + 0.025, 0.6);
    const knob = mesh(new THREE.SphereGeometry(0.018, 10, 8), M.brass);
    knob.position.set(x + (i % 2 ? -1 : 1) * (dw / 2 - 0.1), BH / 2 + 0.05, D / 2 + 0.04);
    g.add(knob);
  }

  // 上部:鏡を 3 つのアーチ状の区画に分ける柱
  const top = 2.75;
  const mirrorW = L - 1.6;
  const backZ = -D / 2 + 0.02;
  box(g, L, top - BH, 0.04, M.woodDark, 0, BH + (top - BH) / 2, -D / 2 + 0.02, 1); // 背板
  // 実際に映り込む鏡は重いので、スマホでは光沢のある板で代用する
  const mirror = realMirror
    ? new Reflector(new THREE.PlaneGeometry(mirrorW, 1.3), {
        textureWidth: 1024,
        textureHeight: 256,
        color: 0x8a8478,
        clipBias: 0.003,
      })
    : new THREE.Mesh(
        new THREE.PlaneGeometry(mirrorW, 1.3),
        new THREE.MeshStandardMaterial({ color: 0x2a2620, metalness: 0.9, roughness: 0.15 }),
      );
  mirror.position.set(0, 1.35 + 0.65, backZ + 0.03);
  g.add(mirror);

  // 鏡の前のガラス棚と瓶
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x9ab0a8, transparent: true, opacity: 0.35, roughness: 0.05 });
  const rng = createRng(7);
  const colors = [0x5a2a08, 0x3a1a06, 0x2a3a18, 0x6a4a1a, 0x1a2a2a, 0x7a3010, 0xa08860];
  for (const sy of [BH + 0.05, 1.75]) {
    if (sy > BH + 0.1) {
      const shelf = mesh(new THREE.BoxGeometry(mirrorW, 0.015, 0.22), shelfMat, { cast: false });
      shelf.position.set(0, sy, backZ + 0.14);
      g.add(shelf);
    }
    let x = -mirrorW / 2 + 0.12;
    while (x < mirrorW / 2 - 0.1) {
      const bt = createBottle(M, {
        color: colors[Math.floor(rng() * colors.length)],
        height: 0.24 + rng() * 0.1,
        fill: rng(),
        label: rng() < 0.8,
      });
      bt.position.set(x, sy + 0.008, backZ + 0.14 + (rng() - 0.5) * 0.06);
      bt.rotation.y = rng() * Math.PI;
      g.add(bt);
      x += 0.1 + rng() * 0.12;
      if (rng() < 0.08) x += 0.25; // ところどころ空きを作る
    }
  }

  // 柱(ろくろ挽き)と区画
  const cols = [-L / 2 + 0.4, -mirrorW / 6, mirrorW / 6, L / 2 - 0.4];
  for (const cx of cols) {
    lathe(
      g,
      [[0, 0], [0.09, 0], [0.09, 0.08], [0.06, 0.12], [0.05, 0.5], [0.065, 0.9], [0.05, 1.4], [0.075, 1.5], [0.09, 1.6], [0.09, 1.68], [0, 1.68]],
      M.woodRed,
      16,
    ).position.set(cx, BH + 0.05, backZ + 0.1);
  }
  // 左右の端の小物棚
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - 0.4);
    for (const y of [1.35, 1.85, 2.3]) {
      const gl = createGlass(M);
      gl.position.set(x - sx * 0.25, y, backZ + 0.12);
      g.add(gl);
      box(g, 0.6, 0.03, 0.25, M.woodDark, x - sx * 0.25, y - 0.015, backZ + 0.13, 0.6);
    }
  }
  // 鏡の枠
  box(g, mirrorW + 0.1, 0.08, 0.06, M.woodDark, 0, 1.33, backZ + 0.05, 1);
  box(g, mirrorW + 0.1, 0.08, 0.06, M.woodDark, 0, 2.67, backZ + 0.05, 1);

  // 冠飾り(上部の張り出し)
  box(g, L + 0.2, 0.12, D * 0.8, M.woodRed, 0, top + 0.06, -D / 2 + 0.2, 1);
  box(g, L + 0.3, 0.05, D * 0.85, M.woodDark, 0, top + 0.145, -D / 2 + 0.21, 1);
  for (let x = -L / 2; x <= L / 2; x += 0.25) {
    box(g, 0.1, 0.06, 0.05, M.woodDark, x, top - 0.03, -D / 2 + 0.38, 0.3); // 歯飾り
  }

  // 看板
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture({ text: 'SALOON' }), roughness: 0.8 });
  const sign = mesh(new THREE.PlaneGeometry(3.2, 0.8), signMat, { cast: false });
  sign.position.set(0, top + 0.65, -D / 2 + 0.06);
  g.add(sign);
  // 看板の額縁
  box(g, 3.3, 0.06, 0.05, M.woodDark, 0, top + 1.07, -D / 2 + 0.06, 1);
  box(g, 3.3, 0.06, 0.05, M.woodDark, 0, top + 0.23, -D / 2 + 0.06, 1);
  return g;
}

// ブリキの傘が付いた吊りランプ。光源の位置を返す
export function createHangingLamp(M, ceilingY, lampY) {
  const g = new THREE.Group();
  rod(g, V(0, lampY + 0.3, 0), V(0, ceilingY, 0), 0.006, M.iron);
  const shade = mesh(new THREE.ConeGeometry(0.3, 0.18, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a4038, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
  shade.position.y = lampY + 0.2;
  g.add(shade);
  lathe(g, [[0, 0], [0.07, 0], [0.08, 0.04], [0.06, 0.07], [0.02, 0.08], [0, 0.08]], M.brass, 16).position.y = lampY - 0.05;
  const chimney = mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.16, 16, 1, true), M.glassLamp, { cast: false });
  chimney.position.y = lampY + 0.1;
  g.add(chimney);
  const flame = mesh(new THREE.SphereGeometry(0.014, 8, 8), M.flame, { cast: false });
  flame.scale.y = 2;
  flame.position.y = lampY + 0.07;
  g.add(flame);
  g.userData.lightPos = V(0, lampY + 0.06, 0);
  return g;
}
