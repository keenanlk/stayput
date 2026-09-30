/**
 * Encode a picture as close under a byte limit as possible. JPG and WebP get
 * the highest quality that fits, found by bisection; when even the lowest
 * quality is too big (or for PNG, which has no quality), the picture is drawn
 * smaller and tried again, if the caller allows it.
 */
import { canvasToBlob, type EncodeType } from './image';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface FitResult {
  blob: Blob;
  width: number;
  height: number;
  /** The quality used, for JPG and WebP. */
  quality?: number;
  /** False when the limit could not be met; the smallest attempt is returned. */
  fits: boolean;
}

const LOW = 0.05;
const HIGH = 0.95;

async function encode(canvas: AnyCanvas, type: EncodeType, quality?: number): Promise<Blob> {
  const blob = await canvasToBlob(canvas, type, type === 'image/png' ? undefined : quality);
  if (blob.type !== type) throw new Error(`This browser cannot save ${type.replace('image/', '').toUpperCase()} images.`);
  return blob;
}

async function bestQuality(canvas: AnyCanvas, type: EncodeType, maxBytes: number): Promise<{ blob: Blob; quality: number } | { smallest: Blob }> {
  const top = await encode(canvas, type, HIGH);
  if (top.size <= maxBytes) return { blob: top, quality: HIGH };
  const bottom = await encode(canvas, type, LOW);
  if (bottom.size > maxBytes) return { smallest: bottom };
  let lo = LOW;
  let hi = HIGH;
  let best = { blob: bottom, quality: LOW };
  for (let i = 0; i < 7; i++) {
    const q = (lo + hi) / 2;
    const b = await encode(canvas, type, q);
    if (b.size <= maxBytes) {
      best = { blob: b, quality: q };
      lo = q;
    } else hi = q;
  }
  return best;
}

/**
 * `draw(w, h)` renders the picture at a size; `shrink` says whether it may be
 * drawn smaller than `width`×`height` to meet the limit.
 */
export async function fitBytes(draw: (w: number, h: number) => AnyCanvas, width: number, height: number, type: EncodeType, maxBytes: number, shrink: boolean): Promise<FitResult> {
  let w = width;
  let h = height;
  let smallest: FitResult | undefined;
  for (let round = 0; round < 10; round++) {
    const canvas = draw(w, h);
    let over: number;
    if (type === 'image/png') {
      const blob = await encode(canvas, type);
      if (blob.size <= maxBytes) return { blob, width: w, height: h, fits: true };
      smallest = { blob, width: w, height: h, fits: false };
      over = blob.size;
    } else {
      const r = await bestQuality(canvas, type, maxBytes);
      if ('blob' in r) return { blob: r.blob, width: w, height: h, quality: r.quality, fits: true };
      smallest = { blob: r.smallest, width: w, height: h, quality: LOW, fits: false };
      over = r.smallest.size;
    }
    if (!shrink || (w <= 16 && h <= 16)) break;
    // File size grows roughly with the pixel count; aim a little under.
    const f = Math.max(0.3, Math.min(0.9, Math.sqrt(maxBytes / over) * 0.95));
    w = Math.max(1, Math.round(w * f));
    h = Math.max(1, Math.round(h * f));
  }
  return smallest!;
}
