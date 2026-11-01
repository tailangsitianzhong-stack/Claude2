// QR コードの表示とカメラでの読み取り(必要になったときだけライブラリを読み込む)
const QR_GEN = 'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/+esm';
const QR_READ = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';

export async function renderQR(el, text) {
  const mod = await import(/* @vite-ignore */ QR_GEN);
  const qrcode = mod.default ?? mod.qrcode ?? mod;
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

// カメラで QR を読み取る。stop() で中止。読めたら文字列で resolve
export function scanQR(video) {
  let stopped = false;
  let stream = null;
  const stop = () => {
    stopped = true;
    stream?.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  const promise = (async () => {
    const mod = await import(/* @vite-ignore */ QR_READ);
    const jsQR = mod.default ?? mod;
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (stopped) {
      stop();
      return null;
    }
    video.setAttribute('playsinline', '');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    while (!stopped) {
      await new Promise((r) => requestAnimationFrame(r));
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) continue;
      const scale = Math.min(1, 720 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (found?.data) {
        stop();
        return found.data;
      }
    }
    return null;
  })();
  return { promise, stop };
}
