/**
 * Background removal in the browser. ISNet general-use (DIS; see /licenses for its licensing),
 * with its weights stored as 8-bit integers (computed in full precision), finds the foreground at 1024×1024; the mask is
 * scaled back to the photo's own size and used as its alpha channel, so the
 * cut-out keeps full resolution. The model runs in a web worker
 * (bg.worker.ts). Nothing is fetched until the first photo, and nothing but
 * the model and runtime is ever fetched.
 */
import { makeCanvas } from './image';
import { blur as boxBlur } from './blur';
import { refineMask } from './mask';

const SIZE = 1024;
/** ISNet expects RGB scaled to 0..1 with the ImageNet mean subtracted (std 1). */
const MEAN = [0.485, 0.456, 0.406] as const;

let worker: Worker | undefined;
let nextId = 0;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./bg.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

function toTensor(bitmap: ImageBitmap): Float32Array {
  const canvas = makeCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const plane = SIZE * SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = data[i * 4]! / 255 - MEAN[0];
    out[plane + i] = data[i * 4 + 1]! / 255 - MEAN[1];
    out[2 * plane + i] = data[i * 4 + 2]! / 255 - MEAN[2];
  }
  return out;
}

/**
 * The foreground mask for a photo, 1024×1024, 0 (background) to 255 (subject),
 * cleaned up by `refineMask`; `keep` (-1 to 1) keeps less or more of what the
 * model is unsure about.
 */
export function findSubject(bitmap: ImageBitmap, onLoading?: (fraction: number) => void, keep = 0): Promise<Uint8ClampedArray> {
  const id = nextId++;
  const pixels = toTensor(bitmap);
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { id: number; type: string; fraction?: number; mask?: Uint8ClampedArray; message?: string };
      if (msg.id !== id) return;
      if (msg.type === 'loading') return onLoading?.(msg.fraction ?? 0);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (msg.type === 'mask') resolve(refineMask(msg.mask!, SIZE, keep));
      else reject(new Error(msg.message ?? 'Background removal failed.'));
    };
    const onError = (e: ErrorEvent) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      worker = undefined;
      reject(new Error(e.message || 'The background remover could not start in this browser.'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, type: 'mask', pixels }, [pixels.buffer]);
  });
}

export interface CutoutOptions {
  /** A CSS colour to put behind the subject, or undefined for transparency. */
  background?: string;
}

/**
 * The photo at full size with the mask applied as transparency, optionally
 * over a solid colour. Compositing does the scaling, so a 48 megapixel photo
 * never needs a full-size pixel copy in JavaScript.
 */
export function cutout(bitmap: ImageBitmap, mask: Uint8ClampedArray, opts: CutoutOptions = {}): HTMLCanvasElement | OffscreenCanvas {
  const m = makeCanvas(SIZE, SIZE);
  const mctx = m.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const img = mctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < mask.length; i++) img.data[i * 4 + 3] = mask[i]!;
  mctx.putImageData(img, 0, 0);

  const { width, height } = bitmap;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(m, 0, 0, width, height);
  if (opts.background) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** Longest side the background is blurred at; the blur is scaled up afterwards, which also softens it further. */
const BLUR_WORK = 800;

/**
 * The photo at full size with its background blurred, like a phone's portrait
 * mode. `strength` is 1 to 10, relative to the photo's size. The blur is done
 * at a small size and scaled up, so it costs the same on a 48 megapixel photo.
 */
export function blurBackground(bitmap: ImageBitmap, mask: Uint8ClampedArray, strength: number): HTMLCanvasElement | OffscreenCanvas {
  const { width, height } = bitmap;
  const scale = Math.min(1, BLUR_WORK / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * scale));
  const sh = Math.max(1, Math.round(height * scale));
  const small = makeCanvas(sw, sh);
  const sctx = small.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  sctx.drawImage(bitmap, 0, 0, sw, sh);
  const s = Math.min(10, Math.max(1, strength));
  boxBlur(sctx, { x: 0, y: 0, w: sw, h: sh }, Math.max(2, Math.round(Math.min(sw, sh) * s * 0.012)));

  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, width, height);
  ctx.drawImage(cutout(bitmap, mask), 0, 0);
  return canvas;
}

/** Share of the frame the subject covers, 0..1, to catch photos where nothing was found. */
export function coverage(mask: Uint8ClampedArray): number {
  let sum = 0;
  for (const v of mask) sum += v;
  return sum / (mask.length * 255);
}
