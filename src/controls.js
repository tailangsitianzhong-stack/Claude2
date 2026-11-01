// 一人称視点の操作。席に座った状態(首だけ動かせる)と、確認用の自由移動モード
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class SeatControls {
  constructor(camera, dom, seats, bounds) {
    this.camera = camera;
    this.dom = dom;
    this.seats = seats; // [{ eye: Vector3, yaw: number }]
    this.bounds = bounds;
    this.seatIndex = 0;
    this.mode = 'seat';
    this.lookYaw = 0; // 席の正面からのずれ
    this.lookPitch = -0.2;
    this.freeYaw = 0;
    this.freePitch = 0;
    this.baseYaw = seats[0].yaw;
    this.keys = new Set();
    this.time = 0;
    this.sensitivity = 0.0022;
    this.onChange = () => {};

    camera.position.copy(seats[0].eye);
    this._bind();
  }

  _bind() {
    const d = this.dom;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    d.addEventListener('click', () => {
      if (this.touch) return; // スマホではポインターロックを使わない
      if (document.pointerLockElement !== d) d.requestPointerLock?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === d) this._look(e.movementX, e.movementY);
      else if (dragging) {
        this._look(e.clientX - lx, e.clientY - ly);
        lx = e.clientX;
        ly = e.clientY;
      }
    });
    d.addEventListener('mousedown', (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
    });
    window.addEventListener('mouseup', () => (dragging = false));
    d.addEventListener('touchstart', (e) => {
      this.touch = true;
      const t = e.touches[0];
      lx = t.clientX;
      ly = t.clientY;
    }, { passive: true });
    d.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      this._look((t.clientX - lx) * 1.5, (t.clientY - ly) * 1.5);
      lx = t.clientX;
      ly = t.clientY;
    }, { passive: true });

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (/^Digit[1-4]$/.test(e.code)) this.setSeat(Number(e.code.slice(5)) - 1);
      if (e.code === 'KeyF') this.toggleFree();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  _look(dx, dy) {
    const s = this.sensitivity;
    if (this.mode === 'seat') {
      // 座ったまま振り向ける範囲に制限
      this.lookYaw = clamp(this.lookYaw - dx * s, -1.9, 1.9);
      this.lookPitch = clamp(this.lookPitch - dy * s, -1.1, 0.8);
    } else {
      this.freeYaw -= dx * s;
      this.freePitch = clamp(this.freePitch - dy * s, -1.5, 1.5);
    }
  }

  setSeat(i) {
    this.mode = 'seat';
    this.seatIndex = i;
    this.lookYaw = 0;
    this.lookPitch = -0.2;
    this.onChange();
  }

  toggleFree() {
    if (this.mode === 'seat') {
      this.mode = 'free';
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.freeYaw = e.y;
      this.freePitch = e.x;
    } else {
      this.mode = 'seat';
    }
    this.onChange();
  }

  update(dt) {
    this.time += dt;
    const cam = this.camera;
    if (this.mode === 'seat') {
      const seat = this.seats[this.seatIndex];
      const k = 1 - Math.exp(-dt * 5);
      cam.position.lerp(seat.eye, k);
      this.baseYaw += wrapAngle(seat.yaw - this.baseYaw) * k;
      // 呼吸による僅かな揺れ
      const breath = Math.sin(this.time * 1.4) * 0.004;
      cam.position.y += (seat.eye.y + breath - cam.position.y) * k;
      cam.rotation.set(this.lookPitch, this.baseYaw + this.lookYaw, 0, 'YXZ');
    } else {
      cam.rotation.set(this.freePitch, this.freeYaw, 0, 'YXZ');
      const speed = (this.keys.has('ShiftLeft') ? 5 : 2.2) * dt;
      const f = new THREE.Vector3(-Math.sin(this.freeYaw), 0, -Math.cos(this.freeYaw));
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const move = new THREE.Vector3();
      if (this.keys.has('KeyW')) move.add(f);
      if (this.keys.has('KeyS')) move.sub(f);
      if (this.keys.has('KeyD')) move.add(r);
      if (this.keys.has('KeyA')) move.sub(r);
      if (this.keys.has('KeyE') || this.keys.has('Space')) move.y += 1;
      if (this.keys.has('KeyQ')) move.y -= 1;
      cam.position.addScaledVector(move, speed);
      const b = this.bounds;
      cam.position.x = clamp(cam.position.x, b.min.x, b.max.x);
      cam.position.y = clamp(cam.position.y, b.min.y, b.max.y);
      cam.position.z = clamp(cam.position.z, b.min.z, b.max.z);
    }
  }
}
