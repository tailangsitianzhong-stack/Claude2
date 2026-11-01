// 椅子に座った対戦相手のキャラクター(基本図形の組み合わせ)
// ローカル座標:座面の中心が原点の真上、正面(テーブル側)が +z
import * as THREE from 'three';
import { mesh } from '../materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// 2 点を結ぶカプセル(手足)
function limb(parent, a, b, r, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 14), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  parent.add(m);
  return m;
}

function sphere(parent, r, mat, x, y, z, sx = 1, sy = 1, sz = 1, seg = 20) {
  const m = mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

const std = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

// ─── 帽子 ───
function cowboyHat(color, bandColor) {
  const g = new THREE.Group();
  const felt = std(color, 0.85, { side: THREE.DoubleSide });
  // つば:左右が反り上がり、前後が少し下がる
  const brimGeo = new THREE.LatheGeometry(
    [V(0.0, 0.0, 0), V(0.1, 0.0, 0), V(0.16, -0.002, 0), V(0.2, 0.004, 0)].map((v) => new THREE.Vector2(v.x, v.y)),
    48,
  );
  const p = brimGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i) * 1.12;
    const r = Math.hypot(x, z);
    const t = Math.max(0, (r - 0.1) / 0.11);
    const side = r > 0 ? Math.abs(x) / r : 0;
    p.setXYZ(i, x, p.getY(i) + t * t * 0.06 * side ** 2 - t * 0.012 * (1 - side), z);
  }
  brimGeo.computeVertexNormals();
  g.add(mesh(brimGeo, felt));
  // クラウン(山):上部に縦のへこみ
  const crownGeo = new THREE.LatheGeometry(
    [[0.0, 0.0], [0.092, 0.0], [0.094, 0.05], [0.088, 0.1], [0.07, 0.125], [0.03, 0.128], [0.0, 0.12]].map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  );
  const cp = crownGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i);
    const y = cp.getY(i);
    const z = cp.getZ(i) * 1.12;
    const dent = Math.max(0, 1 - Math.abs(x) / 0.05) * Math.max(0, (y - 0.06) / 0.07) * 0.035;
    // 前側をつまんだ形
    const pinch = z > 0.04 ? 1 - Math.max(0, (y - 0.07) / 0.06) * 0.25 * (z / 0.1) : 1;
    cp.setXYZ(i, x * pinch, y - dent, z);
  }
  crownGeo.computeVertexNormals();
  g.add(mesh(crownGeo, felt));
  const band = mesh(new THREE.CylinderGeometry(0.0945, 0.0945, 0.022, 40, 1, true), std(bandColor, 0.6));
  band.scale.z = 1.12;
  band.position.y = 0.012;
  g.add(band);
  return g;
}

function derbyHat(color) {
  const g = new THREE.Group();
  const felt = std(color, 0.7, { side: THREE.DoubleSide });
  const brim = mesh(
    new THREE.LatheGeometry([[0, 0], [0.095, 0], [0.13, 0.004], [0.14, 0.018]].map(([r, y]) => new THREE.Vector2(r, y)), 40),
    felt,
  );
  brim.scale.z = 1.1;
  g.add(brim);
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(0.093 * Math.cos(a) + (i === 12 ? 0 : 0), 0.035 + Math.sin(a) * 0.085));
  }
  pts.unshift(new THREE.Vector2(0.093, 0));
  const crown = mesh(new THREE.LatheGeometry(pts, 40), felt);
  crown.scale.z = 1.1;
  g.add(crown);
  const band = mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.02, 40, 1, true), std(0x111111, 0.5));
  band.scale.z = 1.1;
  band.position.y = 0.012;
  g.add(band);
  return g;
}

function flatHat(color, bandColor) {
  const g = new THREE.Group();
  const felt = std(color, 0.85, { side: THREE.DoubleSide });
  const brim = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.006, 48), felt);
  brim.scale.z = 1.08;
  g.add(brim);
  const crown = mesh(new THREE.CylinderGeometry(0.085, 0.092, 0.085, 40), felt);
  crown.scale.z = 1.1;
  crown.position.y = 0.045;
  g.add(crown);
  const band = mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.018, 40, 1, true), std(bandColor, 0.5));
  band.scale.z = 1.1;
  band.position.y = 0.012;
  g.add(band);
  return g;
}

// ─── 頭部 ───
function createHead(o) {
  const head = new THREE.Group();
  const skin = std(o.skin, 0.62);
  const dark = std(0x140c08, 0.5);
  const hairMat = std(o.hair, 0.9);

  sphere(head, 0.1, skin, 0, 0.1, 0, 0.92, 1.12, 1.0, 32); // 頭蓋
  sphere(head, 0.075, skin, 0, 0.045, 0.018, 1.0, 1.0, 1.0, 24); // あご
  sphere(head, 0.02, skin, 0, 0.095, 0.098, 0.7, 1.0, 1.0, 12); // 鼻筋
  sphere(head, 0.016, skin, 0, 0.078, 0.104, 1.1, 0.9, 1.0, 12); // 鼻先
  for (const s of [-1, 1]) {
    sphere(head, 0.022, skin, s * 0.092, 0.1, 0.0, 0.5, 1.0, 0.8, 12); // 耳
    sphere(head, 0.02, skin, s * 0.048, 0.062, 0.058, 1, 0.8, 0.7, 12); // 頬
  }

  // 目(まばたき用にグループ化)
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.034, 0.11, 0.083);
    sphere(e, 0.013, std(0xeee8dc, 0.3), 0, 0, 0, 1, 0.75, 0.6, 14);
    sphere(e, 0.0072, std(o.eye ?? 0x2a1a10, 0.2), 0, 0, 0.007, 1, 1, 0.6, 12);
    head.add(e);
    eyes.push(e);
    // 眉
    const brow = mesh(new THREE.BoxGeometry(0.034, 0.007, 0.01), std(o.brow ?? o.hair, 0.9));
    brow.position.set(s * 0.034, 0.133, 0.09);
    brow.rotation.z = s * (o.browAngle ?? 0.1);
    head.add(brow);
  }
  // 口
  const mouth = mesh(new THREE.BoxGeometry(0.036, 0.005, 0.01), std(0x5a2a22, 0.6));
  mouth.position.set(0, 0.04, 0.09);
  head.add(mouth);

  // 髪
  if (o.hairStyle === 'short') {
    sphere(head, 0.1, hairMat, 0, 0.115, -0.012, 0.95, 1.05, 1.0, 24).scale.set(0.95, 0.95, 0.98);
    for (const s of [-1, 1]) sphere(head, 0.03, hairMat, s * 0.085, 0.085, -0.02, 0.5, 1.2, 1.2, 12);
  } else if (o.hairStyle === 'long') {
    sphere(head, 0.104, hairMat, 0, 0.11, -0.016, 0.98, 1.08, 1.0, 24);
    const tail = limb(head, V(0, 0.06, -0.09), V(0, -0.13, -0.12), 0.035, hairMat);
    tail.scale.x = 1.4;
    for (const s of [-1, 1]) limb(head, V(s * 0.08, 0.1, 0.02), V(s * 0.085, 0.0, 0.0), 0.022, hairMat);
  } else if (o.hairStyle === 'bald') {
    for (const s of [-1, 1]) sphere(head, 0.03, hairMat, s * 0.085, 0.08, -0.03, 0.5, 1.0, 1.4, 12);
    sphere(head, 0.05, hairMat, 0, 0.07, -0.08, 1.5, 0.8, 0.5, 12);
  }

  // ひげ
  if (o.beard === 'full') {
    sphere(head, 0.07, hairMat, 0, 0.025, 0.04, 1.15, 1.1, 0.95, 20);
    sphere(head, 0.04, hairMat, 0, -0.025, 0.06, 1.1, 1.2, 0.9, 16);
  }
  if (o.beard === 'full' || o.beard === 'mustache' || o.beard === 'handlebar') {
    for (const s of [-1, 1]) {
      const end = o.beard === 'handlebar' ? V(s * 0.055, 0.06, 0.08) : V(s * 0.04, 0.042, 0.088);
      limb(head, V(s * 0.004, 0.056, 0.1), end, 0.009, hairMat);
    }
  }
  if (o.beard === 'stubble') {
    sphere(head, 0.077, std(o.hair, 1, { transparent: true, opacity: 0.35 }), 0, 0.043, 0.02, 1.0, 1.0, 1.0, 20);
  }

  // 帽子
  if (o.hat) {
    let hat;
    if (o.hat.type === 'cowboy') hat = cowboyHat(o.hat.color, o.hat.band ?? 0x1a1008);
    else if (o.hat.type === 'derby') hat = derbyHat(o.hat.color);
    else hat = flatHat(o.hat.color, o.hat.band ?? 0x1a1008);
    hat.traverse((m) => (m.castShadow = false));
    hat.position.set(0, 0.168, -0.008);
    hat.rotation.x = o.hat.tilt ?? -0.08;
    hat.rotation.z = o.hat.roll ?? 0;
    head.add(hat);
  }
  head.userData.eyes = eyes;
  return head;
}

// ─── 全身 ───
export function createCharacter(o) {
  const root = new THREE.Group();
  const b = o.build ?? 1;
  const shirt = std(o.shirt, 0.85);
  const vest = std(o.vest, 0.7);
  const pants = std(o.pants, 0.9);
  const boots = std(o.boots ?? 0x2a1a10, 0.55);
  const skin = std(o.skin, 0.62);
  const sleeve = o.coat ? std(o.coat, 0.8) : shirt;

  // 脚
  for (const s of [-1, 1]) {
    const hip = V(s * 0.09 * b, 0.53, -0.04);
    const knee = V(s * (0.12 * b), 0.54, 0.36);
    const ankle = V(s * 0.13 * b, 0.1, 0.4);
    limb(root, hip, knee, 0.068 * b, pants);
    limb(root, knee, ankle, 0.052 * b, pants);
    // ブーツ
    const boot = mesh(new THREE.BoxGeometry(0.095, 0.1, 0.26), boots);
    boot.position.set(ankle.x, 0.055, ankle.z + 0.06);
    root.add(boot);
    sphere(root, 0.048, boots, ankle.x, 0.05, ankle.z + 0.18, 1, 0.9, 1.3, 14);
    limb(root, V(ankle.x, 0.1, ankle.z), V(ankle.x, 0.22, ankle.z - 0.01), 0.055, boots); // 筒
  }

  // 胴(腰を支点にわずかに前傾)
  const torso = new THREE.Group();
  torso.position.set(0, 0.52, -0.04);
  torso.rotation.x = o.lean ?? 0.1;
  root.add(torso);
  const chest = mesh(new THREE.CapsuleGeometry(0.15, 0.22, 8, 20), o.coat ? std(o.coat, 0.8) : vest);
  chest.scale.set(1.18 * b, 1, 0.72 * b);
  chest.position.y = 0.26;
  torso.add(chest);
  // ベストの開き(シャツが見える V 字)
  const vShape = new THREE.Shape();
  vShape.moveTo(-0.055, 0.42);
  vShape.lineTo(0.055, 0.42);
  vShape.lineTo(0.012, 0.16);
  vShape.lineTo(-0.012, 0.16);
  vShape.closePath();
  const vGeo = new THREE.ShapeGeometry(vShape);
  const vMesh = mesh(vGeo, shirt, { cast: false });
  vMesh.position.z = 0.112 * b + 0.002;
  vMesh.rotation.x = -0.12;
  torso.add(vMesh);
  if (o.coat) {
    // 襟(ラペル)とその下のベスト
    for (const s of [-1, 1]) {
      const lapel = mesh(new THREE.BoxGeometry(0.05, 0.2, 0.012), std(o.coat, 0.7));
      lapel.position.set(s * 0.06, 0.33, 0.112 * b + 0.004);
      lapel.rotation.set(-0.1, 0, s * 0.35);
      torso.add(lapel);
    }
    const inner = mesh(new THREE.BoxGeometry(0.1, 0.18, 0.01), vest);
    inner.position.set(0, 0.2, 0.112 * b);
    torso.add(inner);
    // 座面に垂れた上着の裾
    const tail = mesh(new THREE.BoxGeometry(0.36 * b, 0.32, 0.03), std(o.coat, 0.8));
    tail.position.set(0, 0.08, -0.16);
    tail.rotation.x = 0.15;
    torso.add(tail);
  } else {
    // ベストのボタン
    for (let i = 0; i < 4; i++) {
      sphere(torso, 0.006, std(o.button ?? 0xc9a14a, 0.3, { metalness: 0.8 }), 0.022, 0.18 + i * 0.05, 0.112 * b + 0.006, 1, 1, 0.5, 8);
    }
  }
  // ネクタイ・バンダナ
  if (o.bandana) {
    const band = mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 20), std(o.bandana, 0.9));
    band.rotation.x = Math.PI / 2 - 0.2;
    band.position.set(0, 0.46, 0.0);
    torso.add(band);
    const knot = mesh(new THREE.ConeGeometry(0.06, 0.1, 3), std(o.bandana, 0.9));
    knot.rotation.set(Math.PI - 0.15, 0, 0);
    knot.scale.z = 0.3;
    knot.position.set(0, 0.39, 0.085);
    torso.add(knot);
  }
  if (o.tie) {
    const knot = mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), std(o.tie, 0.5));
    knot.position.set(0, 0.44, 0.11 * b + 0.006);
    torso.add(knot);
    for (const s of [-1, 1]) {
      const tail = mesh(new THREE.BoxGeometry(0.008, 0.09, 0.006), std(o.tie, 0.5));
      tail.position.set(s * 0.008, 0.39, 0.11 * b + 0.008);
      tail.rotation.z = s * 0.1;
      torso.add(tail);
    }
  }
  // ベルトとバックル
  const belt = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 24, 1, true), std(0x2a1608, 0.5));
  belt.scale.set(1.18 * b, 1, 0.72 * b);
  belt.position.y = 0.06;
  torso.add(belt);
  const buckle = mesh(new THREE.BoxGeometry(0.045, 0.035, 0.01), std(0xb8b0a0, 0.3, { metalness: 1 }));
  buckle.position.set(0, 0.06, 0.108 * b + 0.004);
  torso.add(buckle);
  // 首
  const neck = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 16), skin);
  neck.position.y = 0.5;
  torso.add(neck);

  // 頭(首の付け根を支点に回す)
  const head = createHead(o);
  head.position.set(0, 0.53, 0.01);
  torso.add(head);

  // 腕:肩の位置は胴に追従し、手の目標位置に向けて肘を自動で曲げる(2 関節 IK)
  const baseLean = torso.rotation.x;
  const restHands = o.hands ?? [V(-0.17, 0.845, 0.22), V(0.17, 0.845, 0.22)];
  const arms = [-1, 1].map((s, i) => {
    const L1 = 0.29 * b;
    const L2 = 0.28 * b;
    const shoulderBall = sphere(root, 0.062 * b, sleeve, 0, 0, 0, 1, 1, 1, 14);
    const upper = mesh(new THREE.CapsuleGeometry(0.05 * b, L1, 6, 14), sleeve);
    const fore = mesh(new THREE.CapsuleGeometry(0.043 * b, L2, 6, 14), sleeve);
    root.add(upper, fore);
    const hand = new THREE.Group();
    sphere(hand, 0.045, skin, 0, 0, 0.035, 0.85, 0.36, 1.0, 16); // 手の甲
    // 指(先を下に曲げる)
    for (let f = 0; f < 4; f++) {
      const fx = -0.024 + f * 0.016;
      const len = f === 0 || f === 3 ? 0.9 : 1;
      limb(hand, V(fx, 0.0, 0.07), V(fx * 1.05, -0.012, 0.092 * len), 0.0085, skin);
      limb(hand, V(fx * 1.05, -0.012, 0.092 * len), V(fx * 1.05, -0.034, 0.1 * len), 0.008, skin);
    }
    limb(hand, V(-s * 0.03, -0.004, 0.02), V(-s * 0.042, -0.012, 0.06), 0.01, skin); // 親指
    root.add(hand);
    return {
      s,
      L1,
      L2,
      shoulderBall,
      upper,
      fore,
      hand,
      shoulderLocal: V(s * 0.19 * b, 0.4, 0),
      rest: restHands[i].clone(),
      target: restHands[i].clone(),
      handQuat: null, // 指定があれば手の向きをこれに合わせる(root 座標)
      pole: V(s * 0.35, -0.8, -0.45),
      controlled: false, // true の間はゲーム側が target を毎フレーム決める
    };
  });

  root.userData = {
    torso,
    head,
    arms,
    eyes: head.userData.eyes,
    baseLean,
    lean: baseLean,
    leanOffset: 0, // 一時的な前傾・のけぞり(びくっとする等)
    breath: Math.random() * 10,
    nextLook: 0,
    nextBlink: 1 + Math.random() * 3,
    blinkT: -1,
    lookYaw: 0,
    lookPitch: 0,
    target: null,
    focus: null, // 強制的に見る対象(ワールド座標)
    headOverride: null, // { yaw, pitch } 指定時は視線よりも優先
    eyesClosed: false,
    tremble: 0, // 0〜1 震えの強さ
    dead: false,
    deathT: 0,
  };
  return root;
}

// 2 点を結ぶ部材の位置と向きを合わせる
const _up = V(0, 1, 0);
const _z = V(0, 0, 1);
function placeLimb(m, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
}

// 2 関節 IK。target・肩の位置はキャラクターの root 座標
function solveArm(arm, torso) {
  const sh = arm.shoulderLocal.clone().applyMatrix4(torso.matrix);
  const d = new THREE.Vector3().subVectors(arm.target, sh);
  let dist = d.length();
  const maxR = arm.L1 + arm.L2 - 0.002;
  if (dist > maxR) {
    d.setLength(maxR);
    dist = maxR;
  }
  dist = Math.max(dist, 0.05);
  const dir = d.clone().normalize();
  const cosA = THREE.MathUtils.clamp((arm.L1 ** 2 + dist ** 2 - arm.L2 ** 2) / (2 * arm.L1 * dist), -1, 1);
  const a = Math.acos(cosA);
  const pole = arm.pole.clone().addScaledVector(dir, -arm.pole.dot(dir)).normalize();
  const elbow = sh.clone().addScaledVector(dir, Math.cos(a) * arm.L1).addScaledVector(pole, Math.sin(a) * arm.L1);
  const wrist = sh.clone().add(d);
  arm.shoulderBall.position.copy(sh);
  placeLimb(arm.upper, sh, elbow);
  placeLimb(arm.fore, elbow, wrist);
  arm.hand.position.copy(wrist);
  if (arm.handQuat) arm.hand.quaternion.copy(arm.handQuat);
  else {
    const fd = new THREE.Vector3().subVectors(wrist, elbow);
    fd.y = Math.min(fd.y, 0) * 0.6;
    arm.hand.quaternion.setFromUnitVectors(_z, fd.normalize());
  }
  return sh;
}

// 毎フレームの動き(呼吸・視線・まばたき・腕・死亡時の崩れ落ち)
const tmp = new THREE.Vector3();
export function updateCharacter(ch, t, dt, targets) {
  const u = ch.userData;
  const k = 1 - Math.exp(-dt * 4);

  if (u.dead) {
    // 撃たれてテーブルに突っ伏す
    u.deathT = Math.min(1, u.deathT + dt * 1.6);
    const e = 1 - (1 - u.deathT) ** 3;
    u.torso.rotation.x = THREE.MathUtils.lerp(u.lean, 0.82, e);
    u.torso.rotation.z = THREE.MathUtils.lerp(0, 0.12, e);
    u.head.rotation.set(THREE.MathUtils.lerp(u.lookPitch, 0.75, e), THREE.MathUtils.lerp(u.lookYaw, 0.35, e), 0, 'YXZ');
    for (const ey of u.eyes) ey.scale.y = 0.08;
    u.torso.updateMatrix();
    for (const arm of u.arms) {
      if (arm.controlled) continue;
      arm.handQuat = null;
      if (arm.s < 0) {
        // 銃を持っていた腕はだらりと垂れる
        const sh = arm.shoulderLocal.clone().applyMatrix4(u.torso.matrix);
        arm.target.lerp(sh.add(V(arm.s * 0.06, -0.55, 0.08)), k * 2);
      } else {
        arm.target.lerp(V(0.14, 0.84, 0.3), k);
      }
      solveArm(arm, u.torso);
    }
    return;
  }

  // 前傾(びくっとした後などは徐々に戻る)
  u.leanOffset += (0 - u.leanOffset) * (1 - Math.exp(-dt * 2));
  u.torso.rotation.x = u.lean + u.leanOffset;
  u.torso.rotation.z = 0;

  // 呼吸と震え
  const br = Math.sin(t * 1.3 + u.breath);
  const tr = u.tremble;
  u.torso.scale.set(1 + br * 0.006, 1 + br * 0.008, 1 + br * 0.012);
  if (tr > 0) {
    u.torso.rotation.x += (Math.random() - 0.5) * 0.012 * tr;
    u.torso.rotation.z = (Math.random() - 0.5) * 0.01 * tr;
  }

  // 視線
  u.nextLook -= dt;
  if (u.nextLook <= 0) {
    u.target = targets[Math.floor(Math.random() * targets.length)];
    u.nextLook = 1.5 + Math.random() * 4;
  }
  const tgt = u.focus ?? u.target;
  if (u.headOverride) {
    u.lookYaw += (u.headOverride.yaw - u.lookYaw) * k;
    u.lookPitch += (u.headOverride.pitch - u.lookPitch) * k;
  } else if (tgt) {
    tmp.copy(tgt);
    u.head.parent.worldToLocal(tmp);
    tmp.sub(u.head.position);
    tmp.y -= 0.1; // 目の高さ分
    if (tmp.lengthSq() < 0.09 && !u.focus) u.nextLook = 0; // 自分自身を選んだら選び直す
    const yaw = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -1.1, 1.1);
    const pitch = THREE.MathUtils.clamp(Math.atan2(-tmp.y, Math.hypot(tmp.x, tmp.z)), -0.4, 0.6);
    const kk = u.focus ? k * 2 : k;
    u.lookYaw += (yaw - u.lookYaw) * kk;
    u.lookPitch += (pitch - u.lookPitch) * kk;
  }
  const jitter = tr * 0.02;
  u.head.rotation.set(u.lookPitch + (Math.random() - 0.5) * jitter, u.lookYaw + (Math.random() - 0.5) * jitter, 0, 'YXZ');

  // まばたき(目を閉じている間は閉じたまま)
  if (u.eyesClosed) {
    for (const e of u.eyes) e.scale.y += (0.08 - e.scale.y) * k * 3;
  } else {
    u.nextBlink -= dt;
    if (u.nextBlink <= 0) {
      u.blinkT = 0;
      u.nextBlink = 2 + Math.random() * 4;
    }
    let s = 1;
    if (u.blinkT >= 0) {
      u.blinkT += dt;
      s = u.blinkT < 0.15 ? Math.abs(Math.cos((u.blinkT / 0.15) * Math.PI)) : 1;
      if (u.blinkT >= 0.15) u.blinkT = -1;
    }
    for (const e of u.eyes) e.scale.y = Math.max(0.08, s);
  }

  // 腕
  u.torso.updateMatrix();
  for (const arm of u.arms) {
    if (!arm.controlled) {
      arm.target.lerp(arm.rest, k * 2);
      arm.handQuat = null;
    }
    solveArm(arm, u.torso);
  }
}

// キャラクターの状態を初期化する(もう一度遊ぶとき)
export function resetCharacter(ch) {
  const u = ch.userData;
  u.dead = false;
  u.deathT = 0;
  u.focus = null;
  u.headOverride = null;
  u.eyesClosed = false;
  u.tremble = 0;
  u.leanOffset = 0;
  u.torso.rotation.set(u.baseLean, 0, 0);
  for (const arm of u.arms) {
    arm.controlled = false;
    arm.handQuat = null;
    arm.target.copy(arm.rest);
  }
}

// 4 人分の見た目
export const CHARACTER_PRESETS = [
  {
    name: '赤バンダナの若造',
    skin: 0xe0b08a, hair: 0x5a3418, hairStyle: 'short', beard: 'stubble',
    shirt: 0x6a7f9a, vest: 0x5a3820, pants: 0x3a4250, bandana: 0x9a1a14,
    hat: { type: 'cowboy', color: 0x8a6a48, band: 0x2a1a0c, tilt: -0.12 },
  },
  {
    name: '白髭の老ギャンブラー',
    skin: 0xd8a888, hair: 0xd8d4cc, hairStyle: 'bald', beard: 'full', browAngle: 0.25,
    shirt: 0xe8e2d4, vest: 0x5a1a1a, coat: 0x1e1c1e, pants: 0x262426, tie: 0x111111,
    hat: { type: 'flat', color: 0x151313, band: 0x3a3a3a, tilt: -0.04 }, lean: 0.06,
  },
  {
    name: '口ひげの大男',
    skin: 0x8a5a3a, hair: 0x1a120c, hairStyle: 'short', beard: 'handlebar', build: 1.18,
    shirt: 0xb89a6a, vest: 0x2e3a2a, pants: 0x4a3a2a, button: 0xd8d0c0,
    hat: { type: 'derby', color: 0x3a2a1c }, lean: 0.14,
  },
  {
    name: '黒髪の女ギャンブラー',
    skin: 0xf0c8a8, hair: 0x140c0a, hairStyle: 'long', beard: 'none', build: 0.88, eye: 0x2a4a3a, browAngle: -0.05,
    shirt: 0xe6dccb, vest: 0x4a1a4a, pants: 0x22181e, bandana: 0x1a1a1a,
    hat: { type: 'flat', color: 0x2a1c2a, band: 0x8a6a2a, tilt: -0.1, roll: 0.08 },
  },
];
