// シングルアクションのリボルバー(全長 約 33cm)
// 銃のローカル座標:銃口方向 +x、上 +y、厚み方向 z。銃身の軸は y = 0
import * as THREE from 'three';
import { mesh } from '../materials.js';

function extrude(shape, depth, mat, bevel = 0.0015) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 12,
  });
  g.translate(0, 0, -depth / 2);
  return mesh(g, mat);
}

function rectShape(x0, y0, x1, y1) {
  const s = new THREE.Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.closePath();
  return s;
}

export function createRevolver() {
  const blued = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 1, roughness: 0.32 });
  const worn = new THREE.MeshStandardMaterial({ color: 0x5a5650, metalness: 1, roughness: 0.4 }); // 擦れて地金が出た部分
  const caseHard = new THREE.MeshStandardMaterial({ color: 0x4a4038, metalness: 1, roughness: 0.3 }); // 焼き入れのフレーム
  const walnut = new THREE.MeshStandardMaterial({ color: 0x2e140a, roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 });
  const hole = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });

  const gun = new THREE.Group();

  // 銃身
  const barrel = mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.19, 24), blued);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.x = 0.045 + 0.095;
  gun.add(barrel);
  const muzzle = mesh(new THREE.CircleGeometry(0.0045, 16), hole, { cast: false });
  muzzle.rotation.y = Math.PI / 2;
  muzzle.position.x = 0.2352;
  gun.add(muzzle);
  // 照星
  const sight = extrude(rectShape(0.222, 0.006, 0.232, 0.0125), 0.002, blued, 0.0005);
  gun.add(sight);
  // エジェクターロッドのハウジング
  const ejector = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.115, 16), blued);
  ejector.rotation.z = Math.PI / 2;
  ejector.position.set(0.11, -0.0145, -0.002);
  gun.add(ejector);
  const ejHead = mesh(new THREE.SphereGeometry(0.006, 12, 8), worn);
  ejHead.position.set(0.17, -0.0145, -0.002);
  gun.add(ejHead);

  // フレーム(シリンダーの窓が開いた形)
  const frame = new THREE.Shape();
  frame.moveTo(-0.05, 0.012);
  frame.lineTo(0.05, 0.012);
  frame.lineTo(0.058, 0.006);
  frame.lineTo(0.058, -0.022);
  frame.lineTo(0.046, -0.036);
  frame.lineTo(-0.012, -0.04);
  frame.lineTo(-0.035, -0.042);
  frame.lineTo(-0.05, -0.04);
  frame.closePath();
  const win = new THREE.Path();
  win.moveTo(-0.026, 0.0065);
  win.lineTo(0.042, 0.0065);
  win.lineTo(0.042, -0.033);
  win.lineTo(-0.026, -0.033);
  win.closePath();
  frame.holes.push(win);
  gun.add(extrude(frame, 0.022, caseHard));

  // シリンダー(溝付き、薬室の穴が開いている)
  const R = 0.0205;
  const cyl = new THREE.Shape();
  const flutes = 6;
  for (let i = 0; i < flutes; i++) {
    const a0 = (i / flutes) * Math.PI * 2; // 溝が薬室と薬室の間に来るように
    // 外周の弧
    const a1 = a0 + (Math.PI * 2) / flutes - 0.38;
    const p0 = [Math.cos(a0 + 0.19) * R, Math.sin(a0 + 0.19) * R];
    if (i === 0) cyl.moveTo(p0[0], p0[1]);
    cyl.absarc(0, 0, R, a0 + 0.19, a1 + 0.19, false);
    // 溝(内側にへこむ)
    const am = a1 + 0.38;
    const mx = Math.cos(am) * R * 0.78;
    const my = Math.sin(am) * R * 0.78;
    const ex = Math.cos(am + 0.19) * R;
    const ey = Math.sin(am + 0.19) * R;
    cyl.quadraticCurveTo(mx, my, ex, ey);
  }
  const chambers = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * 0.0128, Math.sin(a) * 0.0128, 0.0042, 0, Math.PI * 2, true);
    cyl.holes.push(h);
    chambers.push(a);
  }
  const cylGeo = new THREE.ExtrudeGeometry(cyl, { depth: 0.064, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.001, bevelSegments: 2, curveSegments: 10 });
  cylGeo.translate(0, 0, -0.032);
  const cylinder = new THREE.Group();
  const cylMesh = mesh(cylGeo, blued);
  cylMesh.rotation.y = Math.PI / 2; // 押し出し方向 z → x
  cylinder.add(cylMesh);
  // 薬室の奥(暗く)と、装填された 1 発の薬莢の底
  const back = mesh(new THREE.CircleGeometry(R, 24), hole, { cast: false });
  back.rotation.y = Math.PI / 2;
  back.position.x = -0.02;
  cylinder.add(back);
  cylinder.position.set(0.008, -0.0128, 0);
  gun.add(cylinder);
  // 軸ピン
  const pin = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.075, 10), worn);
  pin.rotation.z = Math.PI / 2;
  pin.position.set(0.01, -0.0128, 0);
  gun.add(pin);

  // ハンマー
  const ham = new THREE.Shape();
  ham.moveTo(-0.046, 0.0);
  ham.lineTo(-0.04, 0.014);
  ham.lineTo(-0.048, 0.03);
  ham.lineTo(-0.062, 0.034);
  ham.lineTo(-0.064, 0.029);
  ham.lineTo(-0.054, 0.024);
  ham.lineTo(-0.052, 0.006);
  ham.closePath();
  const hammerMesh = extrude(ham, 0.007, caseHard, 0.001);
  // 撃鉄は根元を軸に回せるようにする(rotation.z を正にすると起きる)
  hammerMesh.geometry.translate(0.046, 0.002, 0);
  const hammer = new THREE.Group();
  hammer.position.set(-0.046, -0.002, 0);
  hammer.add(hammerMesh);
  gun.add(hammer);

  // グリップ(プラウハンドル形)
  const grip = new THREE.Shape();
  grip.moveTo(-0.03, -0.04);
  grip.quadraticCurveTo(-0.034, -0.08, -0.062, -0.122);
  grip.quadraticCurveTo(-0.074, -0.134, -0.09, -0.126);
  grip.quadraticCurveTo(-0.088, -0.09, -0.07, -0.05);
  grip.quadraticCurveTo(-0.06, -0.022, -0.052, 0.004);
  grip.lineTo(-0.05, -0.04);
  grip.closePath();
  gun.add(extrude(grip, 0.03, walnut, 0.003));
  // 金属のバックストラップとグリップフレーム
  const strap = new THREE.Shape();
  strap.moveTo(-0.052, 0.004);
  strap.quadraticCurveTo(-0.062, -0.024, -0.072, -0.05);
  strap.quadraticCurveTo(-0.09, -0.09, -0.092, -0.127);
  strap.lineTo(-0.088, -0.128);
  strap.quadraticCurveTo(-0.086, -0.09, -0.068, -0.05);
  strap.quadraticCurveTo(-0.058, -0.024, -0.048, 0.004);
  strap.closePath();
  gun.add(extrude(strap, 0.018, blued, 0.001));
  // グリップのネジ
  for (const s of [-1, 1]) {
    const screw = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 12), worn);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(-0.058, -0.075, s * 0.0185);
    gun.add(screw);
  }

  // トリガーガードとトリガー
  const guardGeo = new THREE.TorusGeometry(0.017, 0.0026, 8, 24, Math.PI * 1.1);
  const guard = mesh(guardGeo, brass);
  guard.rotation.z = Math.PI * 0.95;
  guard.position.set(-0.012, -0.041, 0);
  gun.add(guard);
  const trig = new THREE.Shape();
  trig.moveTo(-0.008, -0.04);
  trig.quadraticCurveTo(-0.006, -0.05, -0.014, -0.056);
  trig.lineTo(-0.016, -0.054);
  trig.quadraticCurveTo(-0.011, -0.048, -0.013, -0.04);
  trig.closePath();
  gun.add(extrude(trig, 0.004, blued, 0.0006));

  gun.userData = {
    cylinder,
    hammer,
    chambers,
    muzzle: new THREE.Vector3(0.236, 0, 0), // 銃口(銃のローカル座標)
    grip: new THREE.Vector3(-0.062, -0.07, 0), // 握る位置
  };
  return gun;
}

// 弾丸(.45 口径程度)。立てた状態で原点が底面
export function createCartridge() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.28 });
  const lead = new THREE.MeshStandardMaterial({ color: 0x77736c, metalness: 0.6, roughness: 0.5 });
  const rim = mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.0015, 20), brass);
  rim.position.y = 0.00075;
  g.add(rim);
  const caseM = mesh(new THREE.CylinderGeometry(0.0058, 0.006, 0.03, 20), brass);
  caseM.position.y = 0.0165;
  g.add(caseM);
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.0057 * Math.cos(t * Math.PI * 0.5) ** 0.6, 0.012 * Math.sin(t * Math.PI * 0.5)));
  }
  pts[pts.length - 1].x = 0;
  const bullet = mesh(new THREE.LatheGeometry(pts, 20), lead);
  bullet.position.y = 0.0315;
  g.add(bullet);
  return g;
}
