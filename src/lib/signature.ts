/**
 * The maths behind the signature maker and Sign PDF's image mode: strokes
 * as points, their bounds, a path string that both the canvas and the SVG are
 * drawn from, and the photo method that takes the paper out and keeps the ink.
 * No DOM here, so tests/signature.spec.ts imports it directly.
 */

/** One pen stroke in pad coordinates; `w` is the pen width. */
export interface Stroke {
  pts: [number, number][];
  w: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Sign PDF's three inks, so a signature looks the same in both tools. */
export const INKS = { black: '#111111', blue: '#1a3f8f', brown: '#5a2d0c' } as const;

/** Output widths of the saved image. */
export const OUT_WIDTHS = { small: 600, medium: 1200, large: 2400 } as const;

/** Margin around the signature: 4% of its width, at least 8 px (the pad's own scale). */
const marginFor = (w: number) => Math.max(8, w * 0.04);

/** Box around every point, grown by half the widest pen. Undefined when nothing is drawn. */
export function strokeBounds(strokes: Stroke[]): Bounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let widest = 0;
  for (const s of strokes) {
    if (s.w > widest) widest = s.w;
    for (const [x, y] of s.pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return undefined;
  const g = widest / 2;
  return { minX: minX - g, minY: minY - g, maxX: maxX + g, maxY: maxY + g };
}

/** The rectangle the saved image covers: the bounds plus a margin. Zero area when nothing is drawn. */
export function trimRect(strokes: Stroke[]): Rect {
  const b = strokeBounds(strokes);
  if (!b) return { x: 0, y: 0, w: 0, h: 0 };
  const m = marginFor(b.maxX - b.minX);
  return { x: b.minX - m, y: b.minY - m, w: b.maxX - b.minX + 2 * m, h: b.maxY - b.minY + 2 * m };
}

const n2 = (v: number) => String(Math.round(v * 100) / 100);

/**
 * One stroke as an SVG path. Smoothing draws quadratic curves through the midpoints of
 * consecutive points; without it the points are joined by straight lines. A tap is a zero-length
 * segment, which a round cap turns into a dot.
 */
export function strokePath(stroke: Stroke, smooth: boolean): string {
  const p = stroke.pts;
  const first = p[0];
  if (!first) return '';
  if (p.length === 1) return `M${n2(first[0])} ${n2(first[1])}h0.01`;
  let d = `M${n2(first[0])} ${n2(first[1])}`;
  if (smooth && p.length > 2) {
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i]!;
      const b = p[i + 1]!;
      d += `Q${n2(a[0])} ${n2(a[1])} ${n2((a[0] + b[0]) / 2)} ${n2((a[1] + b[1]) / 2)}`;
    }
    const last = p[p.length - 1]!;
    d += `L${n2(last[0])} ${n2(last[1])}`;
  } else {
    for (let i = 1; i < p.length; i++) d += `L${n2(p[i]![0])} ${n2(p[i]![1])}`;
  }
  return d;
}

/** The drawn signature as an SVG: one path per stroke, no background. */
export function strokesToSvg(strokes: Stroke[], ink: string, smooth: boolean, width: number = OUT_WIDTHS.medium): string {
  const r = trimRect(strokes);
  const w = width;
  const h = r.w > 0 ? Math.round((r.h / r.w) * w) : 0;
  const paths = strokes
    .filter((s) => s.pts.length > 0)
    .map((s) => `<path d="${strokePath(s, smooth)}" fill="none" stroke="${ink}" stroke-width="${n2(s.w)}" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n2(r.x)} ${n2(r.y)} ${n2(r.w)} ${n2(r.h)}" width="${w}" height="${h}">${paths}</svg>`
  );
}

/** Width of the saved image: a photo is never enlarged past its own trimmed width. */
export function outputSize(trimmedWidth: number, chosen: number, fromPhoto: boolean): number {
  return fromPhoto ? Math.max(1, Math.min(chosen, Math.floor(trimmedWidth))) : chosen;
}

/* ------------------------------------------------------------------ */
/* Photo: keep the ink, remove the paper                               */
/* ------------------------------------------------------------------ */

const BLOCK = 4;
const MAX_RADIUS = 6;
const BLUR_RADIUS = 10;

/** Sliding maximum along one axis of a w x h plane, window ±r, edges clamped. */
function slideMax(src: Float32Array, w: number, h: number, r: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const lines = horizontal ? h : w;
  const len = horizontal ? w : h;
  const at = (line: number, i: number) => (horizontal ? line * w + i : i * w + line);
  for (let line = 0; line < lines; line++) {
    for (let i = 0; i < len; i++) {
      const lo = Math.max(0, i - r);
      const hi = Math.min(len - 1, i + r);
      let m = 0;
      for (let k = lo; k <= hi; k++) {
        const v = src[at(line, k)]!;
        if (v > m) m = v;
      }
      out[at(line, i)] = m;
    }
  }
  return out;
}

/** Box blur along one axis, window ±r, averaged over the part that is inside. */
function slideMean(src: Float32Array, w: number, h: number, r: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const lines = horizontal ? h : w;
  const len = horizontal ? w : h;
  const at = (line: number, i: number) => (horizontal ? line * w + i : i * w + line);
  for (let line = 0; line < lines; line++) {
    const prefix = new Float64Array(len + 1);
    for (let i = 0; i < len; i++) prefix[i + 1] = prefix[i]! + src[at(line, i)]!;
    for (let i = 0; i < len; i++) {
      const lo = Math.max(0, i - r);
      const hi = Math.min(len - 1, i + r);
      out[at(line, i)] = (prefix[hi + 1]! - prefix[lo]!) / (hi - lo + 1);
    }
  }
  return out;
}

const smoothstep = (lo: number, hi: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/**
 * Alpha for each pixel of a photo of ink on paper (0 to 255): how much darker the pixel is than
 * the paper around it. The paper is estimated per 4 x 4 block as a running maximum (wider than a
 * pen stroke, so ink is replaced by the paper beside it) blurred smooth, which is what makes an
 * uneven light or a shadow disappear. `strength` is 0 to 100: higher keeps paler ink.
 */
export function inkAlpha(rgba: Uint8ClampedArray, w: number, h: number, strength = 50): Uint8ClampedArray {
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    luma[i] = 0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!;
  }
  const bw = Math.ceil(w / BLOCK);
  const bh = Math.ceil(h / BLOCK);
  const blocks = new Float32Array(bw * bh);
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / BLOCK) * bw;
    for (let x = 0; x < w; x++) {
      const bi = row + Math.floor(x / BLOCK);
      const v = luma[y * w + x]!;
      if (v > blocks[bi]!) blocks[bi] = v;
    }
  }
  let paper = slideMax(slideMax(blocks, bw, bh, MAX_RADIUS, true), bw, bh, MAX_RADIUS, false);
  paper = slideMean(slideMean(paper, bw, bh, BLUR_RADIUS, true), bw, bh, BLUR_RADIUS, false);

  const s = Math.min(100, Math.max(0, strength));
  const lo = 0.28 - 0.0026 * s;
  const hi = lo + 0.25;
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / BLOCK) * bw;
    for (let x = 0; x < w; x++) {
      const p = Math.max(paper[row + Math.floor(x / BLOCK)]!, 1);
      const d = 1 - Math.min(1, Math.max(0, luma[y * w + x]! / p));
      alpha[y * w + x] = Math.round(smoothstep(lo, hi, d) * 255);
    }
  }
  return alpha;
}

/** The box around every pixel with alpha above 8 (as Sign PDF's trim does), plus a 4% margin kept inside the image. Zero area when empty. */
export function trimAlpha(alpha: Uint8ClampedArray, w: number, h: number): Rect {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x]! > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: 0, h: 0 };
  const m = Math.round(Math.max(2, (maxX - minX + 1) * 0.04));
  const x0 = Math.max(0, minX - m);
  const y0 = Math.max(0, minY - m);
  const x1 = Math.min(w - 1, maxX + m);
  const y1 = Math.min(h - 1, maxY + m);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** How much of the plane is ink: the count of pixels above half alpha, and their share. */
export function inkShare(alpha: Uint8ClampedArray): { count: number; share: number } {
  let count = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i]! > 127) count++;
  return { count, share: alpha.length ? count / alpha.length : 0 };
}

/** Is any pixel of an RGBA image not fully opaque? */
export function hasTransparency(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! < 250) return true;
  return false;
}

/** Letters the three script fonts do not carry: Google's `latin` subset. Returns the first one, if any. */
const LATIN = new RegExp('^[\\u0000-\\u00FF\\u0131\\u0152\\u0153\\u02BB\\u02BC\\u02C6\\u02DA\\u02DC\\u0304\\u0308\\u0329\\u2000-\\u206F\\u20AC\\u2122\\u2191\\u2193\\u2212\\u2215\\uFEFF\\uFFFD]$');
export function firstOutsideLatin(text: string): string | undefined {
  return Array.from(text).find((ch) => !LATIN.test(ch));
}
