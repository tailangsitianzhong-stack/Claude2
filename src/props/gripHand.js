// 拳銃のグリップを握った右手(銃のローカル座標で作り、銃の子にする)
// 銃のローカル座標:銃口 +x、上 +y、+z が射手から見て右側
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function seg(parent, a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, d.length()), 4, 10), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  parent.add(m);
  return m;
}

// 点列をつないで 1 本の指にする
function finger(parent, pts, r, mat) {
  for (let i = 0; i < pts.length - 1; i++) seg(parent, pts[i], pts[i + 1], r * (1 - i * 0.06), mat);
}

export function createGripHand(skinColor) {
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
  const root = new THREE.Group();

  // グリップの軸に沿った座標系(原点 = グリップ中央、+y = グリップに沿って上、+x = グリップの前側)
  const H = new THREE.Group();
  H.position.set(-0.062, -0.078, 0);
  H.rotation.z = -0.337;
  root.add(H);

  // 手の甲(右側 +z に当たる)
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.042, 20, 14), skin);
  back.scale.set(0.95, 1.15, 0.42);
  back.position.set(-0.004, -0.004, 0.03);
  H.add(back);
  // 手のひらの付け根(親指の付け根のふくらみ)
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), skin);
  heel.scale.set(1.1, 1.3, 0.8);
  heel.position.set(-0.022, 0.01, 0.006);
  H.add(heel);

  // 中指・薬指・小指:グリップの前側を回り込んで左側まで巻きつく
  const rows = [
    [0.004, 0.0098],
    [-0.017, 0.0094],
    [-0.037, 0.0085],
  ];
  for (const [y, r] of rows) {
    finger(H, [V(0.01, y, 0.031), V(0.03, y, 0.019), V(0.033, y - 0.002, -0.004), V(0.018, y - 0.004, -0.024), V(0.0, y - 0.004, -0.027)], r, skin);
  }
  // 人差し指:引き金にかける
  finger(H, [V(0.012, 0.025, 0.03), V(0.034, 0.036, 0.022), V(0.045, 0.043, 0.008), V(0.043, 0.04, -0.004)], 0.0092, skin);
  // 親指:左側面に沿って前へ
  finger(H, [V(-0.026, 0.02, 0.016), V(-0.024, 0.042, -0.012), V(-0.004, 0.05, -0.026), V(0.02, 0.052, -0.027)], 0.0105, skin);
  // 手首
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.05, 14), skin);
  wrist.position.set(-0.028, -0.05, 0.018);
  wrist.rotation.z = 0.5;
  H.add(wrist);

  root.traverse((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
  });
  root.updateMatrixWorld(true);
  // 腕をつなぐ手首の位置(銃のローカル座標)
  root.userData.wrist = H.localToWorld(V(-0.04, -0.068, 0.02)).clone();
  root.visible = false;
  return root;
}
