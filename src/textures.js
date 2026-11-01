// 外部画像を使わず、Canvas に描いて質感テクスチャを生成する
import * as THREE from 'three';

export function createRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const shade = (c, f) => c.map((v) => Math.max(0, Math.min(255, v * f)));

// 細かいノイズを全体に重ねる
function speckle(ctx, w, h, rng, count, alpha, light = false) {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rng()})`;
    const s = 1 + rng() * 2;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
}

// 大きなムラ(汚れ・色むら)。端をまたぐものは反対側にも描いてタイル可能にする
function blotches(ctx, w, h, rng, count, color, alpha, size) {
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = size * (0.4 + rng());
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, rgb(color, alpha * rng()));
        g.addColorStop(1, rgb(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
}

// 1 枚の板(横方向に木目が流れる)
function drawBoard(ctx, x, y, len, hh, rng, base, opt) {
  const f = 0.8 + rng() * 0.4;
  const col = shade(base, f);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, len, hh);
  ctx.clip();
  ctx.fillStyle = rgb(col);
  ctx.fillRect(x, y, len, hh);

  // 板の中の明暗の帯
  const grad = ctx.createLinearGradient(0, y, 0, y + hh);
  grad.addColorStop(0, 'rgba(255,230,190,0.06)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, len, hh);

  // 木目
  const lines = opt.grainLines;
  for (let k = 0; k < lines; k++) {
    const yy = y + rng() * hh;
    const amp = rng() * hh * 0.08;
    const freq = (Math.PI * 2 * (1 + Math.floor(rng() * 3))) / len;
    const ph = rng() * Math.PI * 2;
    const dark = rng() < 0.75;
    ctx.strokeStyle = dark
      ? `rgba(30,15,5,${0.06 + rng() * 0.16})`
      : `rgba(255,220,170,${0.03 + rng() * 0.06})`;
    ctx.lineWidth = 0.5 + rng() * 1.8;
    ctx.beginPath();
    for (let xx = x; xx <= x + len + 8; xx += 8) {
      const yv = yy + Math.sin((xx - x) * freq + ph) * amp;
      if (xx === x) ctx.moveTo(xx, yv);
      else ctx.lineTo(xx, yv);
    }
    ctx.stroke();
  }

  // 節
  if (rng() < opt.knotChance) {
    const kx = x + len * (0.15 + rng() * 0.7);
    const ky = y + hh * (0.25 + rng() * 0.5);
    const kr = hh * (0.08 + rng() * 0.12);
    for (let r = 4; r >= 1; r--) {
      ctx.strokeStyle = `rgba(35,18,6,${0.12 + 0.08 * (4 - r)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr * r * 1.8, kr * r * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(25,12,4,0.7)';
    ctx.beginPath();
    ctx.ellipse(kx, ky, kr * 1.2, kr * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // すり減った筋
  for (let k = 0; k < opt.wear; k++) {
    ctx.fillStyle = `rgba(255,235,200,${0.02 + rng() * 0.04})`;
    ctx.fillRect(x + rng() * len, y + rng() * hh, 20 + rng() * 120, 1 + rng() * 3);
  }

  // 釘
  if (opt.nails) {
    ctx.fillStyle = 'rgba(15,10,8,0.6)';
    for (const nx of [x + 10, x + len - 14]) {
      for (const ny of [y + hh * 0.3, y + hh * 0.7]) {
        ctx.beginPath();
        ctx.arc(nx, ny, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // 継ぎ目
  if (opt.gap) {
    ctx.fillStyle = opt.gap;
    ctx.fillRect(x - 1, y, 3, hh);
  }
}

// 板張り(床・天井・壁板)。planks 本の板が縦に並び、横方向に継ぎ目が入る
export function plankTexture({
  size = 1024,
  planks = 8,
  base = [120, 78, 45],
  seed = 1,
  gap = 'rgba(18,10,5,0.95)',
  knotChance = 0.35,
  nails = true,
  dirt = 0.5,
} = {}) {
  const rng = createRng(seed);
  const w = size;
  const h = size;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const ph = h / planks;
  const opt = { grainLines: 34, knotChance, wear: 6, nails, gap };

  for (let i = 0; i < planks; i++) {
    const y0 = i * ph;
    const joints = [];
    const n = 1 + Math.floor(rng() * 2);
    for (let j = 0; j < n; j++) joints.push(rng() * w);
    joints.sort((a, b) => a - b);
    for (let j = 0; j < joints.length; j++) {
      const xs = joints[j];
      const xe = j + 1 < joints.length ? joints[j + 1] : joints[0] + w;
      const len = xe - xs;
      // 同じ板を w ずらしてもう一度描き、繋ぎ目なくタイルさせる
      const st = rng() * 1e9;
      for (const off of [0, -w]) {
        drawBoard(ctx, xs + off, y0, len, ph, createRng(st), base, opt);
      }
    }
    // 板の間の溝
    ctx.fillStyle = gap;
    ctx.fillRect(0, y0, w, 2.5);
    ctx.fillStyle = 'rgba(255,220,180,0.05)';
    ctx.fillRect(0, y0 + 3, w, 1.5);
  }

  blotches(ctx, w, h, rng, 26, [20, 10, 4], 0.25 * dirt, size * 0.12);
  speckle(ctx, w, h, rng, 9000, 0.25);
  speckle(ctx, w, h, rng, 2000, 0.06, true);
  return toTexture(c);
}

// 家具用の木目(継ぎ目なし)。色はマテリアル側で掛け合わせる
export function woodGrainTexture({ size = 512, base = [150, 100, 60], seed = 7, lines = 140 } = {}) {
  const rng = createRng(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = rgb(base);
  ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < lines; k++) {
    const yy = rng() * size;
    const amp = rng() * size * 0.02;
    const freq = (Math.PI * 2 * (1 + Math.floor(rng() * 4))) / size;
    const ph = rng() * Math.PI * 2;
    const dark = rng() < 0.7;
    ctx.strokeStyle = dark
      ? `rgba(40,20,6,${0.05 + rng() * 0.18})`
      : `rgba(255,225,180,${0.03 + rng() * 0.07})`;
    ctx.lineWidth = 0.5 + rng() * 2.5;
    for (const oy of [-size, 0, size]) {
      ctx.beginPath();
      for (let xx = 0; xx <= size; xx += 4) {
        const yv = yy + oy + Math.sin(xx * freq + ph) * amp + Math.sin(xx * freq * 3 + ph) * amp * 0.3;
        if (xx === 0) ctx.moveTo(xx, yv);
        else ctx.lineTo(xx, yv);
      }
      ctx.stroke();
    }
  }
  blotches(ctx, size, size, rng, 10, [30, 15, 5], 0.2, size * 0.2);
  speckle(ctx, size, size, rng, 3000, 0.15);
  return toTexture(c);
}

// ヴィクトリア調の壁紙(縞+ダマスク柄+経年の汚れ)
export function wallpaperTexture({ seed = 3 } = {}) {
  const rng = createRng(seed);
  const w = 512;
  const h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a1a1c';
  ctx.fillRect(0, 0, w, h);

  // 縦縞
  for (let i = 0; i < 4; i++) {
    const x = i * (w / 4);
    ctx.fillStyle = 'rgba(30,6,8,0.35)';
    ctx.fillRect(x + w / 8 - 3, 0, 6, h);
    ctx.fillStyle = 'rgba(190,140,70,0.18)';
    ctx.fillRect(x + w / 8 - 10, 0, 2, h);
    ctx.fillRect(x + w / 8 + 8, 0, 2, h);
  }

  // ダマスク柄(花のような装飾)
  const motif = (cx, cy, s) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(175,120,60,0.30)';
    ctx.strokeStyle = 'rgba(200,150,80,0.28)';
    ctx.lineWidth = 2;
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.scale(sx, 1);
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.bezierCurveTo(22, -30, 26, -6, 6, 6);
      ctx.bezierCurveTo(24, 10, 30, 30, 10, 44);
      ctx.bezierCurveTo(6, 30, 2, 22, 0, 18);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6, 6);
      ctx.bezierCurveTo(30, -4, 40, 14, 30, 24);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(30, -26, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(0, -2, 5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const step = w / 4;
  for (let i = -1; i <= 4; i++) {
    for (let j = -1; j <= 4; j++) {
      const cx = i * step + (j % 2 ? step / 2 : 0);
      motif(cx, j * (h / 4) + step / 2, 0.9);
    }
  }

  // 経年の汚れ・日焼け
  blotches(ctx, w, h, rng, 18, [20, 8, 4], 0.35, 90);
  blotches(ctx, w, h, rng, 6, [120, 80, 40], 0.12, 80);
  for (let i = 0; i < 25; i++) {
    const x = rng() * w;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(20,8,4,0)');
    g.addColorStop(1, `rgba(20,8,4,${0.1 * rng()})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + rng() * 10, h);
  }
  speckle(ctx, w, h, rng, 6000, 0.2);
  return toTexture(c);
}

// ポーカーテーブルのフェルト
export function feltTexture({ seed = 5 } = {}) {
  const rng = createRng(seed);
  const s = 512;
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f4a2c';
  ctx.fillRect(0, 0, s, s);
  blotches(ctx, s, s, rng, 30, [10, 25, 12], 0.35, 60);
  blotches(ctx, s, s, rng, 12, [70, 110, 70], 0.08, 50);
  speckle(ctx, s, s, rng, 30000, 0.2);
  speckle(ctx, s, s, rng, 8000, 0.05, true);
  return toTexture(c);
}

// 外の地面(乾いた土)
export function dirtTexture({ seed = 9 } = {}) {
  const rng = createRng(seed);
  const s = 512;
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5b4632';
  ctx.fillRect(0, 0, s, s);
  blotches(ctx, s, s, rng, 40, [30, 20, 12], 0.4, 70);
  blotches(ctx, s, s, rng, 20, [140, 110, 80], 0.15, 50);
  speckle(ctx, s, s, rng, 20000, 0.35);
  speckle(ctx, s, s, rng, 6000, 0.15, true);
  return toTexture(c);
}

// 夜空(星+遠くの岩山のシルエット)。horizon は下端からの割合
export function nightSkyTexture({ seed = 11, horizon = 0.333 } = {}) {
  const rng = createRng(seed);
  const w = 2048;
  const h = 1024;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const hy = h * (1 - horizon);
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, '#03050c');
  g.addColorStop(0.7, '#0c1428');
  g.addColorStop(1, '#2a2a3c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, hy);
  for (let i = 0; i < 1400; i++) {
    const y = rng() * hy * 0.95;
    const a = (0.3 + rng() * 0.7) * (1 - y / hy) ;
    ctx.fillStyle = `rgba(230,235,255,${a})`;
    const s = rng() < 0.03 ? 2.2 : 1;
    ctx.fillRect(rng() * w, y, s, s);
  }
  // 岩山(メサ)のシルエット
  ctx.fillStyle = '#07080e';
  ctx.beginPath();
  ctx.moveTo(0, hy);
  let x = 0;
  let y = hy - 20;
  while (x < w) {
    const mesa = rng() < 0.25;
    if (mesa) {
      const top = hy - 60 - rng() * 70;
      ctx.lineTo(x + 20, top);
      x += 120 + rng() * 200;
      ctx.lineTo(x, top + rng() * 6);
      x += 30;
      y = hy - 10 - rng() * 20;
      ctx.lineTo(x, y);
    } else {
      x += 40 + rng() * 80;
      y = hy - 6 - rng() * 30;
      ctx.lineTo(x, y);
    }
  }
  ctx.lineTo(w, hy - 15);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  return toTexture(c);
}

// 手配書
export function wantedPosterTexture({ name = 'BLACK JACK McCOY', reward = '$500', seed = 13 } = {}) {
  const rng = createRng(seed);
  const w = 384;
  const h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c9b48a';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, rng, 20, [90, 60, 25], 0.3, 70);
  // 焼けた縁
  const eg = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.7);
  eg.addColorStop(0, 'rgba(60,35,10,0)');
  eg.addColorStop(1, 'rgba(60,35,10,0.6)');
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#2a1a0c';
  ctx.textAlign = 'center';
  ctx.font = 'bold 76px Georgia, "Times New Roman", serif';
  ctx.fillText('WANTED', w / 2, 92);
  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText('DEAD OR ALIVE', w / 2, 128);
  // 似顔絵の枠
  ctx.strokeStyle = '#2a1a0c';
  ctx.lineWidth = 4;
  ctx.strokeRect(92, 148, 200, 200);
  ctx.fillStyle = 'rgba(40,25,10,0.75)';
  ctx.beginPath();
  ctx.ellipse(192, 236, 48, 60, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(110, 300, 164, 46);
  // 帽子
  ctx.fillRect(122, 178, 140, 10);
  ctx.fillRect(152, 150, 80, 32);
  ctx.fillStyle = '#2a1a0c';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText(name, w / 2, 392);
  ctx.font = 'bold 56px Georgia, serif';
  ctx.fillText(reward, w / 2, 450);
  ctx.font = '18px Georgia, serif';
  ctx.fillText('REWARD', w / 2, 478);
  speckle(ctx, w, h, rng, 4000, 0.25);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 看板
export function signTexture({ text = 'SALOON', seed = 17 } = {}) {
  const rng = createRng(seed);
  const w = 1024;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a2412';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, i * (h / 4), w, 3);
  }
  blotches(ctx, w, h, rng, 20, [10, 5, 2], 0.4, 80);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 170px Georgia, "Times New Roman", serif';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(text, w / 2 + 6, h / 2 + 8);
  ctx.fillStyle = '#d8b25a';
  ctx.fillText(text, w / 2, h / 2);
  // 剥げたペンキ
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(58,36,18,${0.5 + rng() * 0.5})`;
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 6, 1 + rng() * 3);
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 時計の文字盤
export function clockFaceTexture() {
  const s = 256;
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e6dcc0';
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1208';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 26px Georgia, serif';
  const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillText(roman[i], s / 2 + Math.sin(a) * 96, s / 2 - Math.cos(a) * 96);
  }
  ctx.strokeStyle = '#1a1208';
  ctx.lineCap = 'round';
  const hand = (a, len, wdt) => {
    ctx.lineWidth = wdt;
    ctx.beginPath();
    ctx.moveTo(s / 2, s / 2);
    ctx.lineTo(s / 2 + Math.sin(a) * len, s / 2 - Math.cos(a) * len);
    ctx.stroke();
  };
  hand((10.2 / 12) * Math.PI * 2, 55, 7);
  hand((47 / 60) * Math.PI * 2, 85, 4);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ピアノの鍵盤
export function keyboardTexture() {
  const w = 1024;
  const h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const n = 52;
  const kw = w / n;
  ctx.fillStyle = '#ddd2b4';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#5a5040';
  for (let i = 0; i <= n; i++) ctx.fillRect(i * kw - 1, 0, 2, h);
  ctx.fillStyle = '#141010';
  const pattern = [1, 1, 0, 1, 1, 1, 0];
  for (let i = 0; i < n - 1; i++) {
    if (pattern[(i + 5) % 7]) ctx.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, h * 0.6);
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
