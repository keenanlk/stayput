import { InputError } from './input-error';
/**
 * Pixel comparison for the compare-images tool. Dependency-free so specs can import it.
 * Two RGBA buffers of the same size go in; the changed-pixel count and a difference map come out.
 */

/** The longest side the difference canvas is allowed, so a 24 MP pair does not freeze a phone. */
export const MAX_DIFF_SIDE = 4096;

export const MAX_THRESHOLD = 64;

/** Size to compare at: the given size, shrunk to at most `limit` on the long side. */
export function diffSize(width: number, height: number, limit = MAX_DIFF_SIDE): { width: number; height: number; scaled: boolean } {
  const long = Math.max(width, height);
  if (long <= limit) return { width, height, scaled: false };
  const k = limit / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}

/** True when the two aspect ratios differ by more than 1%, so fitting B to A would stretch it. */
export function aspectDiffers(aw: number, ah: number, bw: number, bh: number): boolean {
  const a = aw / ah;
  const b = bw / bh;
  return Math.abs(a - b) / a > 0.01;
}

export interface DiffResult {
  /** Pixels whose largest channel difference is above the threshold. */
  changed: number;
  total: number;
  /** 0 to 100, unrounded. */
  percent: number;
  /** RGBA map: A dimmed, changed pixels in the highlight colour. */
  map: Uint8ClampedArray;
}

/** Highlight colour for changed pixels. */
export const HIGHLIGHT: readonly [number, number, number] = [255, 32, 96];

/**
 * A pixel differs when any of its R, G, B or alpha values is more than `threshold` (0 to 64) away
 * from the same value in the other image. Threshold 0 flags any change at all.
 */
export function diffPixels(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold: number): DiffResult {
  if (a.length !== b.length) throw new InputError('Both images must be the same size to compare.');
  const t = Math.max(0, Math.min(MAX_THRESHOLD, Math.round(threshold)));
  const total = a.length / 4;
  const map = new Uint8ClampedArray(a.length);
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!), Math.abs(a[i + 3]! - b[i + 3]!));
    if (d > t) {
      changed++;
      map[i] = HIGHLIGHT[0];
      map[i + 1] = HIGHLIGHT[1];
      map[i + 2] = HIGHLIGHT[2];
    } else {
      // A faded towards white, so the highlight stands out on it.
      map[i] = 255 - (255 - a[i]!) * 0.35;
      map[i + 1] = 255 - (255 - a[i + 1]!) * 0.35;
      map[i + 2] = 255 - (255 - a[i + 2]!) * 0.35;
    }
    map[i + 3] = 255;
  }
  return { changed, total, percent: total ? (changed / total) * 100 : 0, map };
}

/** "0.0%", "12.5%", and "<0.1%" when some but under a tenth of a percent differ. */
export function formatPercent(changed: number, total: number): string {
  if (changed === 0 || total === 0) return '0.0%';
  const p = (changed / total) * 100;
  return p < 0.05 ? '<0.1%' : `${p.toFixed(1)}%`;
}
