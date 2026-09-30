/**
 * Pixel art: the picture is first shrunk to a small grid (the browser's
 * smoothing averages each block), then every pixel is snapped to a palette,
 * either one picked from the picture by gifenc's (MIT) quantizer or a fixed
 * retro set, optionally with Floyd–Steinberg dithering. Pixels less than half
 * opaque become fully transparent, the rest fully opaque, as in sprite art.
 */
import { quantize } from 'gifenc';

export type Palette = [number, number, number][];

const hex = (list: string) => list.split(' ').map((h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]);

export const PALETTES: Record<string, Palette> = {
  gameboy: hex('0f380f 306230 8bac0f 9bbc0f'),
  pico8: hex('000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa'),
  bw: hex('000000 ffffff'),
  gray: hex('000000 555555 aaaaaa ffffff'),
};

/** The `colors` most representative colours of the opaque pixels. */
export function autoPalette(data: Uint8ClampedArray, colors: number): Palette {
  const opaque: number[] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]! >= 128) opaque.push(data[i]!, data[i + 1]!, data[i + 2]!, 255);
  if (!opaque.length) return [[0, 0, 0]];
  return quantize(new Uint8ClampedArray(opaque), colors, { format: 'rgb565' }).map((c) => [c[0]!, c[1]!, c[2]!]);
}

function nearest(palette: Palette, r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i]!;
    // Weighted RGB distance: close to how different colours look, and cheap.
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Snap every pixel of `data` (w × h RGBA) to `palette`, in place. */
export function snapToPalette(data: Uint8ClampedArray, w: number, h: number, palette: Palette, dither: boolean): void {
  const err = dither ? new Float32Array(w * h * 3) : undefined;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      if (data[i + 3]! < 128) {
        data[i + 3] = 0;
        continue;
      }
      data[i + 3] = 255;
      const r = data[i]! + (err ? err[p * 3]! : 0);
      const g = data[i + 1]! + (err ? err[p * 3 + 1]! : 0);
      const b = data[i + 2]! + (err ? err[p * 3 + 2]! : 0);
      const c = palette[nearest(palette, r, g, b)]!;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      if (err) {
        const e = [r - c[0], g - c[1], b - c[2]];
        const spread = (dx: number, dy: number, k: number) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny >= h) return;
          const q = (ny * w + nx) * 3;
          err[q] = err[q]! + e[0]! * k;
          err[q + 1] = err[q + 1]! + e[1]! * k;
          err[q + 2] = err[q + 2]! + e[2]! * k;
        };
        spread(1, 0, 7 / 16);
        spread(-1, 1, 3 / 16);
        spread(0, 1, 5 / 16);
        spread(1, 1, 1 / 16);
      }
    }
  }
}
