/**
 * Pixel helpers for the scanner's extra passes: no DOM, no decoder, so they run
 * in the worker and in plain node tests. A photo that holds a code the first
 * pass cannot find is retried with its contrast stretched, enlarged (small
 * codes), or cut into tiles at full size (a code that is a small part of a big
 * photo). Everything stays on the device.
 */

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, row by row. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** Longest side the first pass reads. Bigger photos are read again in tiles at full size. */
export const FIT_SIDE = 2048;
/** Tiles are this wide and high, and overlap by `TILE_OVERLAP` so a code on a seam is whole in one of them. */
export const TILE_SIDE = 1536;
export const TILE_OVERLAP = 384;
/** Never enlarge past this many pixels, so a pass cannot run a phone out of memory. */
const MAX_UPSCALED = 6_000_000;

/** Greyscale with the contrast stretched between the 0.1th and 99.9th percentile (a bar code's bars are a small part of the picture); null when the picture is already full range or flat. */
export function stretchContrast(src: Pixels): Pixels | null {
  const { width, height, data } = src;
  const n = width * height;
  const grey = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const g = (data[p]! * 77 + data[p + 1]! * 150 + data[p + 2]! * 29) >> 8;
    grey[i] = g;
    hist[g]!++;
  }
  const cut = n * 0.001;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]!) < cut; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]!) < cut; hi--);
  if (hi - lo < 8 || hi - lo > 235) return null;
  const out = new Uint8ClampedArray(n * 4);
  const scale = 255 / (hi - lo);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const v = (grey[i]! - lo) * scale;
    out[p] = out[p + 1] = out[p + 2] = v;
    out[p + 3] = 255;
  }
  return { width, height, data: out };
}

/** The largest whole factor (2 or 3) that keeps the picture under the pixel budget; 1 when it is already big. */
export function upscaleFactor(width: number, height: number): number {
  if (Math.max(width, height) >= 1400) return 1;
  for (const f of [3, 2]) if (width * f * height * f <= MAX_UPSCALED) return f;
  return 1;
}

/** Bilinear enlargement by a whole factor. */
export function upscale(src: Pixels, factor: number): Pixels {
  const w = src.width * factor;
  const h = src.height * factor;
  const out = new Uint8ClampedArray(w * h * 4);
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, (y + 0.5) / factor - 0.5);
    const y0 = Math.min(sh - 1, Math.floor(fy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, (x + 0.5) / factor - 0.5);
      const x0 = Math.min(sw - 1, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = src.data[(y0 * sw + x0) * 4 + c]!;
        const b = src.data[(y0 * sw + x1) * 4 + c]!;
        const d = src.data[(y1 * sw + x0) * 4 + c]!;
        const e = src.data[(y1 * sw + x1) * 4 + c]!;
        out[o + c] = (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
      }
    }
  }
  return { width: w, height: h, data: out };
}

export interface Tile {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Overlapping tiles that cover a width x height picture; empty when one fit-sized read already saw everything. */
export function tileGrid(width: number, height: number): Tile[] {
  if (Math.max(width, height) <= FIT_SIDE) return [];
  const axis = (len: number): [number, number][] => {
    if (len <= TILE_SIDE) return [[0, len]];
    const step = TILE_SIDE - TILE_OVERLAP;
    const spans: [number, number][] = [];
    for (let s = 0; ; s += step) {
      if (s + TILE_SIDE >= len) {
        spans.push([Math.max(0, len - TILE_SIDE), Math.min(TILE_SIDE, len)]);
        break;
      }
      spans.push([s, TILE_SIDE]);
    }
    return spans;
  };
  const tiles: Tile[] = [];
  for (const [y, h] of axis(height)) for (const [x, w] of axis(width)) tiles.push({ x, y, width: w, height: h });
  return tiles;
}

/** Light-on-dark turned into dark-on-light. The reader's own invert option skips most 1D bar codes. */
export function invert(src: Pixels): Pixels {
  const out = new Uint8ClampedArray(src.data.length);
  for (let p = 0; p < out.length; p += 4) {
    out[p] = 255 - src.data[p]!;
    out[p + 1] = 255 - src.data[p + 1]!;
    out[p + 2] = 255 - src.data[p + 2]!;
    out[p + 3] = 255;
  }
  return { width: src.width, height: src.height, data: out };
}

/** The picture turned by `degrees` on a canvas big enough to hold it, corners filled with the average edge colour. */
export function rotate(src: Pixels, degrees: number): Pixels {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const w = Math.ceil(Math.abs(src.width * cos) + Math.abs(src.height * sin));
  const h = Math.ceil(Math.abs(src.width * sin) + Math.abs(src.height * cos));
  const out = new Uint8ClampedArray(w * h * 4);
  // Edge colour: the mean of the top row.
  let r = 0, g = 0, b = 0;
  for (let x = 0; x < src.width; x++) {
    r += src.data[x * 4]!;
    g += src.data[x * 4 + 1]!;
    b += src.data[x * 4 + 2]!;
  }
  r /= src.width; g /= src.width; b /= src.width;
  const cx = src.width / 2, cy = src.height / 2, ox = w / 2, oy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - ox, dy = y + 0.5 - oy;
      const sx = dx * cos + dy * sin + cx - 0.5;
      const sy = -dx * sin + dy * cos + cy - 0.5;
      const o = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx > src.width - 1 || sy > src.height - 1) {
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(src.width - 1, x0 + 1), y1 = Math.min(src.height - 1, y0 + 1);
      const tx = sx - x0, ty = sy - y0;
      for (let c = 0; c < 3; c++) {
        const a = src.data[(y0 * src.width + x0) * 4 + c]!;
        const bb = src.data[(y0 * src.width + x1) * 4 + c]!;
        const d = src.data[(y1 * src.width + x0) * 4 + c]!;
        const e = src.data[(y1 * src.width + x1) * 4 + c]!;
        out[o + c] = (a + (bb - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
      }
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}
