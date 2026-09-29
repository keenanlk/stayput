/**
 * Black and white conversions on RGBA pixels: plain grayscale, a punchier
 * high-contrast grayscale, pure black and white (two tones, for documents and
 * signatures) and sepia. Alpha is left alone.
 */
export type MonoMode = 'gray' | 'contrast' | 'bw' | 'sepia';

/** Perceived brightness, Rec. 709 weights. */
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Otsu's threshold: the grey level that best splits the histogram into two classes. */
export function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Convert `data` in place. Returns the threshold used for 'bw' (for tests and notes). */
export function toMono(data: Uint8ClampedArray, mode: MonoMode): number | undefined {
  const n = data.length / 4;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const g = Math.round(lum(data[p]!, data[p + 1]!, data[p + 2]!));
    gray[i] = g;
    hist[g]!++;
  }
  let map: (g: number) => [number, number, number];
  let threshold: number | undefined;
  if (mode === 'bw') {
    threshold = otsu(hist, n);
    map = (g) => (g > threshold! ? [255, 255, 255] : [0, 0, 0]);
  } else if (mode === 'contrast') {
    // Stretch the 1st to 99th percentile to full range, then a gentle S-curve.
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) if ((acc += hist[i]!) >= n * 0.01) { lo = i; break; }
    acc = 0;
    for (let i = 255; i >= 0; i--) if ((acc += hist[i]!) >= n * 0.01) { hi = i; break; }
    const span = Math.max(1, hi - lo);
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      const t = Math.min(1, Math.max(0, (i - lo) / span));
      const s = t * t * (3 - 2 * t);
      lut[i] = Math.round((0.35 * t + 0.65 * s) * 255);
    }
    map = (g) => [lut[g]!, lut[g]!, lut[g]!];
  } else if (mode === 'sepia') {
    // A warm brown-to-cream ramp over brightness, the look of an old print.
    map = (g) => [Math.min(255, g * 1.07 + 20), Math.min(255, g * 0.95 + 8), Math.min(255, g * 0.74)];
  } else {
    map = (g) => [g, g, g];
  }
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const [r, g, b] = map(gray[i]!);
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
  }
  return threshold;
}
