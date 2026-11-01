// 効果音をその場で合成する(音声ファイル不要)
export class Sfx {
  constructor() {
    this.ctx = null;
    this.heartTimer = null;
  }

  // ブラウザの制約で、ボタンを押したタイミングで呼ぶ必要がある
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noise(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  // 金属の「カチッ」
  _tick(at, { freq = 3000, gain = 0.5, dur = 0.035, q = 4 } = {}) {
    const c = this.ctx;
    const src = this._noise(dur);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(at);
    src.stop(at + dur + 0.01);
  }

  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tick(t, { freq: 2600, gain: 0.9, dur: 0.05, q: 3 });
    this._tick(t + 0.012, { freq: 5200, gain: 0.4, dur: 0.03 });
  }

  cock() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tick(t, { freq: 1800, gain: 0.5, dur: 0.04 });
    this._tick(t + 0.11, { freq: 3400, gain: 0.7, dur: 0.035 });
  }

  // シリンダーを回す音(だんだん遅くなるラチェット音)
  spin(dur = 1.0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    let t = 0;
    let gap = 0.03;
    while (t < dur) {
      this._tick(t0 + t, { freq: 4200 + Math.random() * 800, gain: 0.25, dur: 0.02 });
      t += gap;
      gap *= 1.07;
    }
  }

  bang() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    // 破裂音
    const src = this._noise(1.2);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(9000, t);
    f.frequency.exponentialRampToValueAtTime(250, t + 0.6);
    const g = c.createGain();
    g.gain.setValueAtTime(1.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    // 低い衝撃
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.4);
    const og = c.createGain();
    og.gain.setValueAtTime(1.4, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.55);
    // 部屋の残響
    const tail = this._noise(2.0);
    const tf = c.createBiquadFilter();
    tf.type = 'lowpass';
    tf.frequency.value = 900;
    const tg = c.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.linearRampToValueAtTime(0.25, t + 0.08);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
    tail.connect(tf).connect(tg).connect(this.master);
    tail.start(t);
  }

  _thump(at, gain) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, at);
    o.frequency.exponentialRampToValueAtTime(38, at + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + 0.2);
  }

  // 心臓の鼓動(bpm を上げると緊張感が増す)
  heartbeat(on, bpm = 90) {
    clearInterval(this.heartTimer);
    this.heartTimer = null;
    if (!on || !this.ctx) return;
    const beat = () => {
      const t = this.ctx.currentTime;
      this._thump(t, 0.9);
      this._thump(t + 0.16, 0.6);
    };
    beat();
    this.heartTimer = setInterval(beat, 60000 / bpm);
  }
}
