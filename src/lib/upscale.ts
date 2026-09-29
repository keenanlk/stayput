/**
 * AI image upscaling in the browser with Real-ESRGAN general x4v3
 * (BSD-3-Clause, Xintao Wang et al.), a small network trained to add back
 * detail and remove blur and compression blocks while it enlarges. It always
 * enlarges 4×; for a smaller factor the photo is first shrunk so that 4× lands
 * on the size asked for, which is quicker and looks as good. The model runs in
 * a web worker (upscale.worker.ts). Transparency is scaled separately and put
 * back, since the network only sees colour.
 */
import { makeCanvas } from './image';

export const MODEL_SCALE = 4;
/** The largest picture every browser can hold in one canvas (iOS Safari's limit). */
export const MAX_OUTPUT_PIXELS = 16_777_216;

let worker: Worker | undefined;
let nextId = 0;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./upscale.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** The size a picture will come out at for `factor`, held under the canvas limit. */
export function targetSize(w: number, h: number, factor: number): { width: number; height: number; factor: number } {
  const most = Math.sqrt(MAX_OUTPUT_PIXELS / (w * h));
  const f = Math.min(factor, most);
  return { width: Math.max(1, Math.floor(w * f)), height: Math.max(1, Math.floor(h * f)), factor: f };
}

function run(rgba: Uint8ClampedArray, width: number, height: number, onLoading?: (f: number) => void, onProgress?: (f: number) => void): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  const id = nextId++;
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { id: number; type: string; fraction?: number; rgba?: Uint8ClampedArray; width?: number; height?: number; message?: string };
      if (msg.id !== id) return;
      if (msg.type === 'loading') return onLoading?.(msg.fraction ?? 0);
      if (msg.type === 'progress') return onProgress?.(msg.fraction ?? 0);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (msg.type === 'done') resolve({ rgba: msg.rgba!, width: msg.width!, height: msg.height! });
      else reject(new Error(msg.message ?? 'Upscaling failed.'));
    };
    const onError = (e: ErrorEvent) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      worker = undefined;
      reject(new Error(e.message || 'The upscaler could not start in this browser.'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, type: 'upscale', rgba, width, height }, [rgba.buffer]);
  });
}

function draw(bitmap: ImageBitmap, width: number, height: number, background?: string) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { canvas, ctx };
}

export interface UpscaleResult {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  factor: number;
}

/**
 * Enlarge a picture by `factor` (up to 4), held under the canvas limit.
 * `background` fills transparent areas (for JPG); without it they stay transparent.
 */
export async function upscaleImage(bitmap: ImageBitmap, factor: number, opts: { background?: string; onLoading?: (f: number) => void; onProgress?: (f: number) => void } = {}): Promise<UpscaleResult> {
  const target = targetSize(bitmap.width, bitmap.height, factor);
  // What the network sees: the picture at a quarter of the target size.
  const iw = Math.max(1, Math.round(target.width / MODEL_SCALE));
  const ih = Math.max(1, Math.round(target.height / MODEL_SCALE));
  const src = draw(bitmap, iw, ih, opts.background);
  const pixels = src.ctx.getImageData(0, 0, iw, ih);
  let transparent = false;
  for (let i = 3; i < pixels.data.length; i += 4) {
    if (pixels.data[i]! < 255) {
      transparent = true;
      break;
    }
  }
  const up = await run(pixels.data, iw, ih, opts.onLoading, opts.onProgress);

  // The network's output is exactly 4× the input; scale it onto the target size (a few pixels at most).
  const big = makeCanvas(up.width, up.height);
  const bctx = big.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (transparent && !opts.background) {
    // Colour from the network, transparency from a smooth enlargement of the original's.
    const alpha = draw(bitmap, up.width, up.height).ctx.getImageData(0, 0, up.width, up.height).data;
    for (let i = 3; i < up.rgba.length; i += 4) up.rgba[i] = alpha[i]!;
  }
  bctx.putImageData(new ImageData(up.rgba as Uint8ClampedArray<ArrayBuffer>, up.width, up.height), 0, 0);
  const out = makeCanvas(target.width, target.height);
  const octx = out.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (opts.background) {
    octx.fillStyle = opts.background;
    octx.fillRect(0, 0, target.width, target.height);
  }
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, 0, 0, target.width, target.height);
  big.width = big.height = 0;
  return { canvas: out, factor: target.factor };
}
