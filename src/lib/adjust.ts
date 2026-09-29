/**
 * Photo adjustments on raw RGBA pixels: invert, brightness, contrast, warmth,
 * saturation and sharpening. Tone changes go through a lookup table per
 * channel; saturation mixes each pixel with its own brightness; sharpening is
 * an unsharp mask (the picture plus a share of its difference from a blurred
 * copy). Alpha is never changed.
 */
export interface Adjustments {
  /** -100..100: a gamma curve, so black stays black and white stays white. */
  brightness: number;
  /** -100..100 */
  contrast: number;
  /** -100..100: 0 is grey, 100 doubles the colour. */
  saturation: number;
  /** -100..100: negative is cooler (bluer), positive warmer (more orange). */
  warmth: number;
  /** 0..100 */
  sharpen: number;
  invert: boolean;
}

export const NEUTRAL: Adjustments = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpen: 0, invert: false };

export const isNeutral = (a: Adjustments) =>
  !a.invert && a.brightness === 0 && a.contrast === 0 && a.saturation === 0 && a.warmth === 0 && a.sharpen === 0;

function toneTable(a: Adjustments, shift: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const gamma = Math.pow(2, -a.brightness / 100);
  const c = a.contrast * 1.28;
  const k = (259 * (c + 255)) / (255 * (259 - c));
  for (let v = 0; v < 256; v++) {
    let x = a.invert ? 255 - v : v;
    x = 255 * Math.pow(x / 255, gamma);
    x = k * (x - 128) + 128;
    lut[v] = x + shift;
  }
  return lut;
}

/** Blur `src` (RGB of RGBA) with a box of radius r, twice, which is close to a Gaussian. */
function blur(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  let a = new Uint8ClampedArray(src);
  let b = new Uint8ClampedArray(src.length);
  const n = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    // Horizontal, then vertical, clamping at the edges.
    for (let y = 0; y < h; y++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += a[(y * w + Math.min(w - 1, Math.max(0, i))) * 4 + ch]!;
        for (let x = 0; x < w; x++) {
          b[(y * w + x) * 4 + ch] = sum / n;
          sum += a[(y * w + Math.min(w - 1, x + r + 1)) * 4 + ch]! - a[(y * w + Math.max(0, x - r)) * 4 + ch]!;
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += b[(Math.min(h - 1, Math.max(0, i)) * w + x) * 4 + ch]!;
        for (let y = 0; y < h; y++) {
          a[(y * w + x) * 4 + ch] = sum / n;
          sum += b[(Math.min(h - 1, y + r + 1) * w + x) * 4 + ch]! - b[(Math.max(0, y - r) * w + x) * 4 + ch]!;
        }
      }
    }
    if (pass === 0) b = new Uint8ClampedArray(src.length);
  }
  return a;
}

/** The sharpening radius for a picture, in its own pixels: about 1 px per 1200 px of its longer side. */
export const sharpenRadius = (w: number, h: number) => Math.max(1, Math.round(Math.max(w, h) / 1200));

/** Apply `a` to `data` in place. `radius` is the sharpening radius in these pixels. */
export function adjust(data: Uint8ClampedArray, w: number, h: number, a: Adjustments, radius = sharpenRadius(w, h)): void {
  const warm = a.warmth * 0.3;
  const lr = toneTable(a, warm);
  const lg = toneTable(a, 0);
  const lb = toneTable(a, -warm);
  const s = 1 + a.saturation / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = lr[data[i]!]!, g = lg[data[i + 1]!]!, b = lb[data[i + 2]!]!;
    if (s !== 1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * s;
      g = l + (g - l) * s;
      b = l + (b - l) * s;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  if (a.sharpen > 0) {
    const amount = (a.sharpen / 100) * 1.5;
    const soft = blur(data, w, h, Math.max(1, Math.round(radius)));
    for (let i = 0; i < data.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        const v = data[i + ch]!;
        data[i + ch] = v + amount * (v - soft[i + ch]!);
      }
    }
  }
}

/** A short description of what changed, for the result card. */
export function describe(a: Adjustments): string {
  const parts: string[] = [];
  const signed = (v: number) => (v > 0 ? `+${v}` : String(v));
  if (a.invert) parts.push('inverted');
  if (a.brightness) parts.push(`brightness ${signed(a.brightness)}`);
  if (a.contrast) parts.push(`contrast ${signed(a.contrast)}`);
  if (a.saturation) parts.push(`saturation ${signed(a.saturation)}`);
  if (a.warmth) parts.push(`warmth ${signed(a.warmth)}`);
  if (a.sharpen) parts.push(`sharpen ${a.sharpen}`);
  return parts.join(', ');
}
