// ロシアンルーレットの進行
// ・6 連発のシリンダーに弾を 1 発だけ込め、装填したときに一度だけ回す
// ・最下位になった人が 1 回引き金を引く。空撃ちのたびに次の薬室へ進む(だんだん危険になる)
// ・撃たれた人が出たら、次に銃を拾う人が弾を込め直して回し直す
// ・最後の 1 人になるまで続ける
import * as THREE from 'three';
import { resetCharacter } from '../props/character.js';
import { Sfx } from './audio.js';

// true にすると毎回シリンダーを回し直す(確率は常に 1/6)
const RESPIN_EACH_TURN = false;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const ROT_GRIP = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2);

// 銃の +x(銃口方向)と、おおよその上方向から姿勢を作る
function basisQuat(xDir, upRef) {
  const x = xDir.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, upRef).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// プレイヤーの手(一人称で銃を握る手と袖)
function createPlayerHand(skin, sleeve) {
  const g = new THREE.Group();
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const sleeveM = new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.85 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    g.add(m);
    return m;
  };
  // 手のひら(グリップを包む)
  add(new THREE.SphereGeometry(0.03, 16, 12), skinM, -0.07, -0.075, 0, 0, 0, 0.5, 1.0, 1.5, 1.25);
  // 指(グリップの前側を回り込む)
  for (let i = 0; i < 3; i++) {
    add(new THREE.CapsuleGeometry(0.0085, 0.035, 4, 8), skinM, -0.05, -0.06 - i * 0.018, 0, Math.PI / 2, 0, 0);
  }
  add(new THREE.CapsuleGeometry(0.008, 0.02, 4, 8), skinM, -0.02, -0.05, 0.004, 0, 0, Math.PI / 2.4); // 人差し指(引き金)
  add(new THREE.CapsuleGeometry(0.009, 0.035, 4, 8), skinM, -0.055, -0.035, 0.022, 0.2, 0, -1.0); // 親指
  // 前腕と袖口
  const fore = add(new THREE.CapsuleGeometry(0.04, 0.3, 6, 12), sleeveM, -0.13, -0.24, 0.0);
  fore.rotation.z = 0.42;
  add(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 14), skinM, -0.09, -0.115, 0, 0, 0, 0.42);
  g.traverse((m) => {
    m.castShadow = false;
    m.receiveShadow = false;
  });
  g.visible = false;
  return g;
}

export class RouletteGame {
  constructor({ scene, camera, controls, characters, gun, cartridge, tablePos, tableTop, names, presets }) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.gun = gun;
    this.cartridge = cartridge;
    this.tablePos = tablePos.clone();
    this.tableTop = tableTop;
    this.presets = presets;
    this.sfx = new Sfx();
    this.players = characters.map((c, i) => ({ seat: i, name: names[i], character: c, alive: true }));
    this.tasks = [];
    this.started = false;
    this.busy = false;
    this.over = false;
    this.playerSeat = 0;
    this.playerDead = false;
    this.loaded = false;
    this.chamber = 0;
    this.bulletChamber = 0;
    this.holder = null;
    this.gunMove = null;
    this.gunRest = { p: gun.position.clone(), q: gun.quaternion.clone() };

    // 発砲の閃光
    this.flashLight = new THREE.PointLight(0xffd090, 0, 7, 2);
    scene.add(this.flashLight);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,250,220,1)');
    gr.addColorStop(0.3, 'rgba(255,190,90,0.8)');
    gr.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
    this.flashSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.flashSprite.scale.setScalar(0.35);
    this.flashSprite.visible = false;
    scene.add(this.flashSprite);
    this.flashT = 0;

    this.ui = {
      message: document.getElementById('message'),
      players: document.getElementById('players'),
      round: document.getElementById('btn-round'),
      trigger: document.getElementById('btn-trigger'),
      restart: document.getElementById('btn-restart'),
      chamber: document.getElementById('chamber-info'),
      overlay: document.getElementById('overlay'),
      seatButtons: document.getElementById('seat-buttons'),
    };
    this.ui.round.addEventListener('click', (e) => {
      e.stopPropagation();
      this.round();
    });
    this.ui.restart.addEventListener('click', (e) => {
      e.stopPropagation();
      this.restart();
    });
    this.ui.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this._resolveTrigger?.();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR') this.round();
      if ((e.code === 'Enter' || e.code === 'Space') && this._resolveTrigger) {
        e.preventDefault();
        this._resolveTrigger();
      }
    });
    this.renderPlayers();
    this.updateChamberInfo();
  }

  // ─── 時間で進む処理 ───
  tween(dur, fn) {
    return new Promise((res) => this.tasks.push({ dur, t: 0, fn, res }));
  }
  wait(s) {
    return this.tween(s, () => {});
  }

  update(dt) {
    for (const task of [...this.tasks]) {
      task.t += dt;
      const p = Math.min(1, task.t / task.dur);
      task.fn(p);
      if (p >= 1) {
        this.tasks.splice(this.tasks.indexOf(task), 1);
        task.res();
      }
    }
    this._updateGun();
    // 閃光を消していく
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const k = this.flashT / 0.12;
      this.flashLight.intensity = 60 * k * k;
      this.flashSprite.material.opacity = k;
      this.flashSprite.visible = k > 0.01;
    }
  }

  // ─── 銃の位置・姿勢 ───
  _applyPose(p, q) {
    this.gun.position.copy(p);
    this.gun.quaternion.copy(q);
    this.gun.updateMatrixWorld(true);
  }

  _updateGun() {
    const m = this.gunMove;
    if (m) {
      const to = m.to();
      const e = easeInOut(THREE.MathUtils.clamp(m.t, 0, 1));
      const p = m.from.p.clone().lerp(to.p, e);
      p.y += Math.sin(Math.PI * e) * m.arc;
      const q = m.from.q.clone().slerp(to.q, e);
      this._applyPose(p, q);
    }
    // 持っているキャラクターの右手を銃のグリップに合わせる
    if (this.holder?.type === 'npc') {
      const ch = this.holder.ch;
      const arm = ch.userData.arms[0];
      arm.controlled = true;
      const wrist = this.gun.localToWorld(this.gun.userData.grip.clone().add(V(-0.03, -0.012, 0)));
      arm.target.copy(ch.worldToLocal(wrist));
      const chQ = ch.getWorldQuaternion(new THREE.Quaternion()).invert();
      arm.handQuat = chQ.multiply(this.gun.quaternion.clone()).multiply(ROT_GRIP);
    }
  }

  async moveGun(to, dur, arc = 0.1) {
    const from = { p: this.gun.position.clone(), q: this.gun.quaternion.clone() };
    this.gunMove = { from, to, t: 0, arc };
    const mv = this.gunMove;
    await this.tween(dur, (t) => (mv.t = t));
  }

  // テーブルに置いた姿勢。toward を指定するとその席の方へずらして置く
  tablePose(seatIndex = null, yaw = 0.55) {
    const p = this.tablePos.clone();
    p.y = this.tableTop + 0.0165;
    if (seatIndex !== null) {
      const ch = this.players[seatIndex].character;
      const dir = ch.position.clone().sub(this.tablePos).setY(0).normalize();
      p.addScaledVector(dir, 0.42);
    } else {
      p.x += 0.02;
      p.z += 0.03;
    }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, yaw, 0, 'YXZ'));
    return { p, q };
  }

  // キャラクターの胸の前(弾を込めてシリンダーを回す位置)
  npcChestPose(ch) {
    ch.updateMatrixWorld(true);
    const p = ch.localToWorld(V(-0.06, 1.0, 0.3));
    const chQ = ch.getWorldQuaternion(new THREE.Quaternion());
    const x = V(0.55, 0.7, 0.45).applyQuaternion(chQ);
    return { p, q: basisQuat(x, V(0, 1, 0)) };
  }

  // こめかみに銃口を当てた姿勢(右のこめかみ = 頭の -x 側)
  npcTemplePose(ch) {
    const head = ch.userData.head;
    head.updateWorldMatrix(true, false);
    const temple = head.localToWorld(V(-0.1, 0.12, 0.0));
    const center = head.localToWorld(V(0, 0.12, 0.0));
    const x = center.sub(temple).normalize();
    const up = V(0, 1, 0).transformDirection(head.matrixWorld);
    const q = basisQuat(x, up);
    const p = temple.clone().addScaledVector(x, -(this.gun.userData.muzzle.x + 0.004));
    return { p, q };
  }

  // 一人称:カメラの前でシリンダーを回す位置
  playerChestPose() {
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    const hw = this._viewHalfWidth(0.45);
    const p = cam.localToWorld(V(Math.min(0.05, hw * 0.25), -0.16, -0.45));
    const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
    const q = camQ.clone().multiply(basisQuat(V(-0.93, 0.36, 0), V(0, 1, 0)));
    return { p, q };
  }

  // 一人称:右のこめかみに銃口を当てた姿勢(銃の大部分が画面右に見えるように)
  playerTemplePose() {
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    // 銃口がこめかみの少し前に見え、銃身が自分の頭へ向いているとわかる構図
    const hw = this._viewHalfWidth(0.26);
    const temple = V(Math.min(0.065, hw * 0.45), 0.025, -0.075);
    const body = V(Math.min(0.15, hw * 0.62), -0.09, -0.26);
    const x = temple.clone().sub(body).normalize();
    const local = basisQuat(x, V(0, 1, 0));
    const pLocal = temple.clone().addScaledVector(x, -this.gun.userData.muzzle.x);
    const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
    return { p: cam.localToWorld(pLocal), q: camQ.multiply(local) };
  }

  _viewHalfWidth(dist) {
    const cam = this.camera;
    return dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
  }

  // ─── 演出の部品 ───
  say(text, hold = 0) {
    const el = this.ui.message;
    el.textContent = text;
    el.classList.toggle('show', !!text);
    clearTimeout(this._msgTimer);
    if (hold > 0) this._msgTimer = setTimeout(() => el.classList.remove('show'), hold * 1000);
  }

  setOverlay(color, opacity, ms = 0) {
    const o = this.ui.overlay;
    o.style.transition = `opacity ${ms}ms ease`;
    o.style.background = color;
    o.style.opacity = String(opacity);
  }

  muzzleFlash() {
    const mz = this.gun.localToWorld(this.gun.userData.muzzle.clone().add(V(0.02, 0, 0)));
    this.flashLight.position.copy(mz);
    this.flashSprite.position.copy(mz);
    this.flashT = 0.12;
    this.flashLight.intensity = 60;
  }

  async cockHammer() {
    const h = this.gun.userData.hammer;
    const cyl = this.gun.userData.cylinder;
    const c0 = cyl.rotation.x;
    this.sfx.cock();
    await this.tween(0.25, (t) => {
      h.rotation.z = 0.55 * easeOut(t);
      cyl.rotation.x = c0 + (Math.PI / 3) * easeOut(t); // 撃鉄を起こすとシリンダーが 1 つ進む
    });
  }

  dropHammer() {
    this.gun.userData.hammer.rotation.z = 0;
  }

  async spinCylinder(dur = 1.2) {
    const cyl = this.gun.userData.cylinder;
    const c0 = cyl.rotation.x;
    const turns = 3 + Math.random() * 2;
    this.sfx.spin(dur);
    await this.tween(dur, (t) => (cyl.rotation.x = c0 + turns * Math.PI * 2 * easeOut(t)));
  }

  load() {
    this.loaded = true;
    this.bulletChamber = Math.floor(Math.random() * 6);
    this.chamber = 0;
    this.updateChamberInfo();
  }

  // 引き金を引いた結果(true = 発砲)
  pull() {
    const fired = this.chamber === this.bulletChamber;
    this.chamber++;
    if (RESPIN_EACH_TURN) this.loaded = false;
    this.updateChamberInfo();
    return fired;
  }

  others(except) {
    return this.players.filter((p) => p.alive && p !== except && !(p.seat === this.playerSeat));
  }

  // 生きている他のキャラクターに、ある位置を見させる
  focusOthers(except, worldPos) {
    for (const p of this.others(except)) p.character.userData.focus = worldPos;
  }
  clearFocus() {
    for (const p of this.players) p.character.userData.focus = null;
    this.controls.setFocus(null);
  }

  // ─── 進行 ───
  start() {
    this.started = true;
    this.playerSeat = this.controls.seatIndex;
    this.controls.setSeat(this.playerSeat);
    this.controls.locked = true;
    this.ui.seatButtons.style.display = 'none';
    this.players.forEach((p) => {
      p.name = p.seat === this.playerSeat ? 'あなた' : this.presets[p.seat].name;
    });
    // プレイヤーの手(座っている席のキャラクターの肌・服の色)
    const pre = this.presets[this.playerSeat];
    if (this.playerHand) this.gun.remove(this.playerHand);
    this.playerHand = createPlayerHand(pre.skin, pre.coat ?? pre.shirt);
    this.gun.add(this.playerHand);
    this.cartridge.visible = false;
    this.renderPlayers();
  }

  async round(forceSeat = null) {
    this.sfx.unlock();
    if (this.busy || this.over) return;
    this.busy = true;
    this.ui.round.disabled = true;
    try {
      if (!this.started) {
        this.start();
        this.say('弾を 1 発だけ込める。生き残れるのは 1 人だけだ。');
        await this.wait(2.2);
      }
      const alive = this.players.filter((p) => p.alive);
      let loser = forceSeat !== null ? this.players[forceSeat] : alive[Math.floor(Math.random() * alive.length)];
      if (!loser.alive) loser = alive[0];
      if (loser.seat === this.playerSeat) await this.playerTurn(loser);
      else await this.npcTurn(loser);

      const left = this.players.filter((p) => p.alive);
      if (left.length === 1) {
        this.over = true;
        const w = left[0];
        await this.wait(1.0);
        this.say(w.seat === this.playerSeat ? 'あなたの勝ちだ。最後まで生き残った。' : `${w.name} の勝ち。最後の 1 人になった。`);
        if (w.seat !== this.playerSeat) w.character.userData.focus = this.camera.position;
        this.ui.restart.style.display = '';
      }
    } finally {
      this.busy = false;
      this.ui.round.disabled = false;
      this.ui.round.style.display = this.over ? 'none' : '';
      this.renderPlayers();
    }
  }

  async npcTurn(pl) {
    const ch = pl.character;
    const u = ch.userData;
    const headPos = u.head.getWorldPosition(new THREE.Vector3());
    this.focusOthers(pl, headPos);
    if (!this.playerDead) this.controls.setFocus(headPos);
    this.say(`最下位:${pl.name}`);
    u.focus = this.gun.position;
    await this.wait(1.6);

    // 銃に手を伸ばす
    const arm = u.arms[0];
    arm.controlled = true;
    const start = arm.target.clone();
    const gripW = this.gun.localToWorld(this.gun.userData.grip.clone().add(V(-0.03, -0.012, 0)));
    const gripL = ch.worldToLocal(gripW);
    await this.tween(0.7, (t) => arm.target.lerpVectors(start, gripL, easeInOut(t)));
    this.holder = { type: 'npc', ch };

    if (!this.loaded) {
      this.say(`${pl.name} が弾を込め、シリンダーを回す…`);
      await this.moveGun(() => this.npcChestPose(ch), 0.8, 0.05);
      this.load();
      await this.spinCylinder();
      await this.wait(0.3);
    }

    // こめかみへ
    u.focus = null;
    u.headOverride = { yaw: 0.08, pitch: 0.12 };
    this.say('');
    await this.moveGun(() => this.npcTemplePose(ch), 1.0, 0.04);
    await this.cockHammer();
    u.eyesClosed = true;
    u.tremble = 1;
    this.sfx.heartbeat(true, 105);
    this.say('……');
    await this.wait(1.6 + Math.random() * 1.6);
    this.sfx.heartbeat(false);

    this.dropHammer();
    const fired = this.pull();
    if (!fired) {
      this.sfx.click();
      this.say(`カチッ…… ${pl.name} は生き延びた`, 2.4);
      u.tremble = 0;
      u.eyesClosed = false;
      u.headOverride = null;
      u.leanOffset = -0.14; // 安堵でのけぞる
      await this.wait(1.1);
      await this.moveGun(() => this.tablePose(), 0.9, 0.12);
      this.holder = null;
      arm.controlled = false;
      arm.handQuat = null;
    } else {
      this.sfx.bang();
      this.muzzleFlash();
      this.setOverlay('#fff', 0.35, 0);
      setTimeout(() => this.setOverlay('#fff', 0, 350), 60);
      pl.alive = false;
      u.dead = true;
      u.deathT = 0;
      u.tremble = 0;
      u.headOverride = null;
      this.holder = null;
      arm.controlled = false;
      for (const o of this.others(pl)) o.character.userData.leanOffset = -0.22; // びくっとする
      this.renderPlayers();
      this.say(`バン!── ${pl.name} が撃たれた`, 3);
      this.loaded = false;
      this.updateChamberInfo();
      await this.moveGun(() => this.tablePose(pl.seat, Math.random() * Math.PI * 2), 0.45, 0.06);
      await this.wait(1.8);
    }
    this.clearFocus();
    this.renderPlayers();
  }

  async playerTurn(pl) {
    this.controls.setFocus(this.gun.position.clone());
    this.focusOthers(pl, this.camera.position);
    this.say('最下位:あなた');
    await this.wait(1.6);

    this.holder = { type: 'player' };
    this.playerHand.visible = true;
    this.controls.setFocus(null);
    this.controls.setLookTarget(0, -0.08);
    if (!this.loaded) {
      this.say('弾を込め、シリンダーを回す…');
      await this.moveGun(() => this.playerChestPose(), 0.9, 0.06);
      this.load();
      await this.spinCylinder();
      await this.wait(0.3);
    }
    this.say('');
    await this.moveGun(() => this.playerTemplePose(), 0.9, 0.03);
    await this.cockHammer();
    this.controls.shake = 0.7;
    this.sfx.heartbeat(true, 115);
    this.say('引き金を引け');
    document.exitPointerLock?.();
    this.ui.trigger.style.display = '';
    this.ui.round.style.display = 'none';
    await new Promise((res) => (this._resolveTrigger = res));
    this._resolveTrigger = null;
    this.ui.trigger.style.display = 'none';
    this.ui.round.style.display = '';
    this.sfx.heartbeat(false);

    this.dropHammer();
    const fired = this.pull();
    if (!fired) {
      this.sfx.click();
      this.controls.shake = 0;
      this.say('カチッ…… 生き延びた', 2.4);
      await this.wait(1.1);
      this.controls.setLookTarget(null);
      await this.moveGun(() => this.tablePose(), 0.9, 0.12);
      this.playerHand.visible = false;
      this.holder = null;
    } else {
      this.sfx.bang();
      this.controls.shake = 0;
      this.controls.setLookTarget(null);
      this.setOverlay('#fff', 1, 0);
      pl.alive = false;
      this.playerDead = true;
      this.renderPlayers();
      this.loaded = false;
      this.updateChamberInfo();
      for (const o of this.others(pl)) o.character.userData.leanOffset = -0.22;
      await this.wait(0.12);
      this.setOverlay('#000', 1, 500);
      this.say('');
      await this.wait(0.8);
      this.say('あなたは撃たれた', 0);
      // 自分の体を表示して、テーブルに突っ伏した状態にする
      const me = pl.character;
      me.visible = true;
      me.userData.dead = true;
      me.userData.deathT = 0.97;
      this.playerHand.visible = false;
      this.holder = null;
      this._applyPose(this.tablePose(pl.seat, Math.random() * Math.PI * 2).p, this.tablePose(pl.seat, 1.2).q);
      this.gunMove = null;
      await this.wait(2.4);
      this.controls.spectate(V(this.tablePos.x + 2.3, 2.5, this.tablePos.z + 2.6), V(this.tablePos.x, 0.8, this.tablePos.z));
      this.setOverlay('#000', 0, 1200);
      this.say('観戦中…… 最後の 1 人が決まるまで見届けよう', 3.5);
      await this.wait(1.2);
    }
    this.clearFocus();
    this.renderPlayers();
  }

  restart() {
    this.over = false;
    this.started = false;
    this.playerDead = false;
    this.loaded = false;
    this.chamber = 0;
    this.holder = null;
    this.gunMove = null;
    this.tasks = [];
    this.sfx.heartbeat(false);
    for (const p of this.players) {
      p.alive = true;
      p.name = this.presets[p.seat].name;
      resetCharacter(p.character);
    }
    this.dropHammer();
    if (this.playerHand) this.playerHand.visible = false;
    this._applyPose(this.gunRest.p, this.gunRest.q);
    this.cartridge.visible = true;
    this.controls.locked = false;
    this.controls.shake = 0;
    this.controls.setLookTarget(null);
    this.controls.setSeat(this.playerSeat);
    this.setOverlay('#000', 0, 0);
    this.say('');
    this.ui.restart.style.display = 'none';
    this.ui.round.style.display = '';
    this.ui.seatButtons.style.display = '';
    this.updateChamberInfo();
    this.renderPlayers();
  }

  // ─── 画面表示 ───
  updateChamberInfo() {
    const el = this.ui.chamber;
    if (!this.started) el.textContent = '';
    else if (!this.loaded) el.textContent = 'シリンダー:未装填';
    else el.textContent = `シリンダー:6 発中 1 発 ／ 空撃ち ${this.chamber} 回`;
  }

  renderPlayers() {
    const ul = this.ui.players;
    ul.innerHTML = '';
    for (const p of this.players) {
      const li = document.createElement('li');
      const isMe = this.started ? p.seat === this.playerSeat : p.seat === this.controls.seatIndex;
      li.className = `${p.alive ? 'alive' : 'dead'}${isMe ? ' me' : ''}`;
      const name = isMe && !this.started ? `${this.presets[p.seat].name}(あなた)` : p.name;
      li.innerHTML = `<span class="mark">${p.alive ? '●' : '✕'}</span>${name}`;
      li.title = 'タップするとこの人を最下位にする(テスト用)';
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        if (p.alive) this.round(p.seat);
      });
      ul.appendChild(li);
    }
  }
}
