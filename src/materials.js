// 共通マテリアルと形状ヘルパー
import * as THREE from 'three';
import {
  plankTexture,
  woodGrainTexture,
  wallpaperTexture,
  feltTexture,
  dirtTexture,
} from './textures.js';

export function createMaterials() {
  const grain = woodGrainTexture({ base: [170, 120, 75] });
  const grainDark = woodGrainTexture({ base: [120, 80, 48], seed: 21, lines: 180 });

  const floorTex = plankTexture({ planks: 7, base: [118, 80, 48], seed: 2 });
  const ceilingTex = plankTexture({ planks: 6, base: [72, 48, 30], seed: 4, knotChance: 0.2, dirt: 0.8 });
  const wainscotTex = plankTexture({ planks: 10, base: [98, 62, 36], seed: 6, nails: false, knotChance: 0.15 });

  const wood = (map, color, rough = 0.7) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: 0, bumpMap: map, bumpScale: 0.6 });

  return {
    textures: { floorTex, ceilingTex, wainscotTex, grain, grainDark },
    floor: new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorTex, bumpScale: 1.5, roughness: 0.82 }),
    ceiling: new THREE.MeshStandardMaterial({ map: ceilingTex, roughness: 0.95 }),
    wainscot: new THREE.MeshStandardMaterial({ map: wainscotTex, bumpMap: wainscotTex, bumpScale: 1, roughness: 0.7 }),
    wallpaper: new THREE.MeshStandardMaterial({ map: wallpaperTexture(), roughness: 0.9 }),
    felt: new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 1.0 }),
    dirt: new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 1.0 }),

    // 家具用の木(色違い)
    woodMid: wood(grain, 0xb88a5c, 0.65),
    woodDark: wood(grainDark, 0x6e4a2c, 0.55),
    woodRed: wood(grain, 0x8a4a2c, 0.45), // ニス塗りのマホガニー
    woodRaw: wood(grain, 0xa58060, 0.9), // 樽・木箱用
    woodBeam: wood(grainDark, 0x4a3220, 0.9),

    brass: new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.35 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.8, roughness: 0.55 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x3a1e10, roughness: 0.6 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x5c1418, roughness: 0.95, side: THREE.DoubleSide }),
    paper: new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.9 }),
    glassLamp: new THREE.MeshStandardMaterial({
      color: 0xfff0d0,
      emissive: 0xffb860,
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.55,
      roughness: 0.1,
      depthWrite: false,
    }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffd28a }),
    windowGlass: new THREE.MeshStandardMaterial({
      color: 0x8aa0c0,
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      metalness: 0.2,
      depthWrite: false,
    }),
  };
}

// UV を実寸(メートル)基準にした箱。tile = テクスチャ 1 枚が何 m 分か
export function scaledBox(w, h, d, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry の面順: +x, -x, +y, -y, +z, -z (各 4 頂点)
  const dims = [
    [d, h], [d, h],
    [w, d], [w, d],
    [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  return g;
}

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// 位置付きの箱
export function box(parent, w, h, d, mat, x, y, z, tile = 1) {
  const m = mesh(scaledBox(w, h, d, tile), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// 2 点を結ぶ円柱(脚・スピンドル・パイプ用)
export function rod(parent, a, b, r, mat, rTop = r, seg = 10) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(rTop, r, len, seg);
  const m = mesh(g, mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(m);
  return m;
}

// 輪郭(半径,高さ)の点列から回転体を作る
export function lathe(parent, points, mat, seg = 24) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const m = mesh(g, mat);
  parent.add(m);
  return m;
}
