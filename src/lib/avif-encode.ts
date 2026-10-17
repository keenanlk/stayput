/**
 * AVIF output. Browsers that can encode AVIF from a canvas do it natively;
 * every browser as of this writing returns another format instead, so the
 * jSquash WebAssembly encoder (avif-encode.worker.ts) does the work. It is
 * fetched from /vendor/ only when a conversion starts, and runs in a worker
 * that Cancel ends.
 */
import { canvasToBlob, drawScaled } from './image';
import { fromWorkerFailure } from './worker-error';
import type { AvifSettings, Reply } from './avif-encode.worker';
import { NamedError } from './input-error';

/** Encoder speed for the normal and the "faster encode" setting (libaom's 0 to 10 scale). */
export const AVIF_SPEED = 6;
export const AVIF_SPEED_FAST = 9;

let nativeSupport: Promise<boolean> | undefined;
/** True only where a canvas really produces AVIF (the blob type is what the browser actually wrote). */
export function supportsNativeAvif(): Promise<boolean> {
  nativeSupport ??= (async () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      return (await canvasToBlob(c, 'image/avif', 0.6)).type === 'image/avif';
    } catch {
      return false;
    }
  })();
  return nativeSupport;
}

let worker: Worker | undefined;
let nextId = 0;

function cancelled(): Error {
  const e = new NamedError('AvifEncodeFailed', 'Cancelled.');
  e.name = 'AbortError';
  return e;
}

/** Encode RGBA pixels with the WebAssembly encoder. Aborting ends the worker, so the encode stops at once. */
export function encodeAvifWasm(img: ImageData, settings: AvifSettings, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(cancelled());
  const w = (worker ??= new Worker(new URL('./avif-encode.worker.ts', import.meta.url), { type: 'module' }));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onMessage = (e: MessageEvent<Reply>) => {
      if (e.data.id !== id) return;
      done();
      if (e.data.type === 'done') resolve(new Blob([e.data.bytes as BlobPart], { type: 'image/avif' }));
      else reject(fromWorkerFailure(e.data.name, `The AVIF encoder failed: ${e.data.message}`));
    };
    const onError = (e: ErrorEvent) => {
      done();
      w.terminate();
      if (worker === w) worker = undefined;
      reject(new NamedError('AvifEncodeFailed', e.message || 'The AVIF encoder could not start in this browser. Check your connection and try again.'));
    };
    const onAbort = () => {
      done();
      w.terminate();
      if (worker === w) worker = undefined;
      reject(cancelled());
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
    const rgba = img.data;
    w.postMessage({ id, rgba, width: img.width, height: img.height, ...settings }, [rgba.buffer]);
  });
}

export interface AvifWriteOptions {
  /** 0..1, from the quality slider. */
  quality: number;
  /** Faster encode (lower effort). */
  fast?: boolean;
  /** Output size relative to the source, 0 < scale <= 1. */
  scale?: number;
  signal?: AbortSignal;
}

/** Write a bitmap as AVIF at its own pixel size (or scaled down), keeping transparency. */
export async function writeAvif(bitmap: ImageBitmap, opts: AvifWriteOptions): Promise<Blob> {
  const scale = opts.scale && opts.scale > 0 && opts.scale < 1 ? opts.scale : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const quality = Math.min(100, Math.max(1, Math.round(opts.quality * 100)));
  const canvas = drawScaled(bitmap, width, height);
  if (await supportsNativeAvif()) return canvasToBlob(canvas, 'image/avif', quality / 100);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, width, height);
  // An image with no transparent pixel needs no separate alpha quality; one with some keeps it as good as the colour.
  let transparent = false;
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] !== 255) {
      transparent = true;
      break;
    }
  }
  return encodeAvifWasm(img, { quality, qualityAlpha: transparent ? quality : -1, speed: opts.fast ? AVIF_SPEED_FAST : AVIF_SPEED }, opts.signal);
}
