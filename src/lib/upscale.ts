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
import { LIGHT_OUTPUT_PIXELS, isPhoneBrowser, fullSizeChosen, lightNow } from './light-run';
import { NamedError } from './input-error';
import { fromWorkerFailure } from './worker-error';
import { MODEL_STALL_MS } from './model-stall';
import { modelOffline, networkUp } from './model-fetch';
import { ranOutOfMemory } from './bare-error';
import { UPSCALE_COPY, crashError, memoryError } from './upscale-copy';

export const MODEL_SCALE = 4;
/** The largest picture every browser can hold in one canvas (iOS Safari's limit). */
export const MAX_OUTPUT_PIXELS = 16_777_216;
/** How long a worker that has the model loaded may go without a word before it is counted as stopped. Under the shell's three minutes, so a stopped worker is replaced before the run is called stalled. */
export const UPSCALE_SILENT_MS = 60_000;

let worker: Worker | undefined;
let nextId = 0;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./upscale.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** Stop the current worker for good; the next request starts a new one. */
function dropWorker() {
  worker?.terminate();
  worker = undefined;
}

/** A phone or tablet, or a device that reports 3 GB of memory or less: where a 4× result is most likely to run the tab out of memory. Decided here from the browser's own reports; nothing is sent. */
export function lowMemoryDevice(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { deviceMemory?: number } = navigator): boolean {
  return isPhoneBrowser(nav) || (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 3);
}

/**
 * The size a picture will come out at for `factor`, held under the canvas limit, and (when `light`) under the lighter pixel
 * budget. A lighter budget never takes a picture below its own size: a picture already bigger than the budget is made at 1×.
 */
export function targetSize(w: number, h: number, factor: number, light = lightNow('model') !== undefined): { width: number; height: number; factor: number } {
  const hard = Math.sqrt(MAX_OUTPUT_PIXELS / (w * h));
  const soft = light ? Math.max(Math.sqrt(LIGHT_OUTPUT_PIXELS / (w * h)), Math.min(1, hard)) : hard;
  const f = Math.min(factor, soft, hard);
  return { width: Math.max(1, Math.floor(w * f)), height: Math.max(1, Math.floor(h * f)), factor: f };
}

/** How the model is named in the shared download messages. */
const MODEL_LABEL = { model: 'upscaling model', size: '4.9 MB' };

/** The worker died, or went silent, rather than answering: the one failure that is tried again on a new worker. */
class WorkerGone extends Error {
  /** Whether the worker had said anything at all: one that never did could not even start (its script did not load). */
  heard = false;
}

type Done = { rgba: Uint8ClampedArray; width: number; height: number };
type RunOpts = { onLoading?: (f: number) => void; onProgress?: (f: number) => void; /** Only tests set this (as __stayputUpscaleSilentMs). */ silentMs?: number };

function run(rgba: Uint8ClampedArray, width: number, height: number, opts: RunOpts): Promise<Done> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = getWorker();
    } catch (e) {
      return reject(new WorkerGone(e instanceof Error ? e.message : 'The upscaler could not start in this browser.'));
    }
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    // 'start': nothing heard yet. 'model': downloading or starting the model. 'run': the tiles.
    let phase: 'start' | 'model' | 'run' = 'start';
    const gone = (why: string) => Object.assign(new WorkerGone(why), { heard: phase !== 'start' });
    const settle = (finish: () => void) => {
      clearTimeout(watchdog);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      finish();
    };
    const arm = () => {
      clearTimeout(watchdog);
      if (phase === 'model') {
        // The download's own stall rule: a connection that gives no byte for this long is not a crash, and a new worker would only wait on it again.
        watchdog = setTimeout(
          () =>
            settle(() => {
              dropWorker();
              reject(new NamedError('ModelDownloadStalled', `Downloading the upscaling model stalled: nothing arrived for ${Math.round(MODEL_STALL_MS / 1000)} seconds. Check your internet connection, then try again.`));
            }),
          MODEL_STALL_MS,
        );
        return;
      }
      watchdog = setTimeout(() => settle(() => reject(gone('The upscaler stopped answering.'))), opts.silentMs ?? (globalThis as { __stayputUpscaleSilentMs?: number }).__stayputUpscaleSilentMs ?? UPSCALE_SILENT_MS);
    };
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { id: number; type: string; fraction?: number; rgba?: Uint8ClampedArray; width?: number; height?: number; name?: string; message?: string };
      if (msg.id !== id) return;
      if (msg.type === 'loading') {
        phase = 'model';
        arm();
        return opts.onLoading?.(msg.fraction ?? 0);
      }
      if (msg.type === 'working' || msg.type === 'progress') {
        phase = 'run';
        arm();
        return msg.type === 'progress' ? opts.onProgress?.(msg.fraction ?? 0) : undefined;
      }
      settle(() => {
        if (msg.type === 'done') return resolve({ rgba: msg.rgba!, width: msg.width!, height: msg.height! });
        // A failed ORT session or a half-finished download leaves the worker in a state a new request should not inherit.
        dropWorker();
        reject(fromWorkerFailure(msg.name, msg.message ?? 'Upscaling failed.'));
      });
    };
    const onError = (e: ErrorEvent) => settle(() => reject(gone(e.message || 'The upscaler stopped.')));
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    arm();
    // Copied, not transferred, so the same picture can be sent again to a new worker.
    w.postMessage({ id, type: 'upscale', rgba, width, height });
  });
}

/**
 * Run on the worker. One that dies or goes silent is replaced and the same picture sent once more; a second death is
 * WorkerCrashError. A model that downloaded but will not start (ModelLoadError) leaves its worker unfit to try again, so that too
 * is retried once on a new worker, and a second failure keeps its own name.
 */
async function runOnFreshWorkerIfLost(rgba: Uint8ClampedArray, width: number, height: number, opts: RunOpts): Promise<Done> {
  try {
    return await run(rgba, width, height, opts);
  } catch (e) {
    if (!(e instanceof WorkerGone) && !(e instanceof Error && e.name === 'ModelLoadError')) throw e;
  }
  dropWorker();
  try {
    return await run(rgba, width, height, opts);
  } catch (e) {
    if (!(e instanceof WorkerGone)) throw e;
    dropWorker();
    // A worker that never started, on a device with no connection, is a page that cannot fetch its own script: offline, not a crash.
    if (!e.heard && (typeof navigator !== 'undefined' && navigator.onLine === false ? true : !(await networkUp()))) throw modelOffline(MODEL_LABEL);
    throw crashError(e);
  }
}

const PLAIN = new Set(['Error', 'TypeError', 'RangeError', 'EncodingError', 'InvalidStateError', 'IndexSizeError', 'SecurityError', 'DataCloneError']);

/** A failure of one step on this page: a memory failure is OutOfMemoryError, an error that already has a name of its own keeps it, anything else is named for the step. */
function inStep(step: string, message: string, e: unknown): Error {
  if (ranOutOfMemory(e) || (e instanceof Error && /out of memory|allocation|could not be allocated|too (large|big)/i.test(e.message))) return memoryError(e);
  if (e instanceof Error && !PLAIN.has(e.name)) return e;
  return new NamedError(step, message, { cause: e });
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
  /** The scale the picture came out at, which is below the one asked for when the canvas limit, this device's budget or a failed first try held it back. */
  factor: number;
  /** Why the result is smaller than asked, when it was made so on purpose: 'device' (started smaller on a device likely to run short of memory) or 'memory' (a try ran out of memory and was made again smaller). */
  smaller?: 'device' | 'memory';
}

type Opts = { background?: string; onLoading?: (f: number) => void; onProgress?: (f: number) => void; silentMs?: number };

/** One try at one size: draw the picture at a quarter of the size, run the tiles, put the result together. */
async function attemptAt(bitmap: ImageBitmap, target: { width: number; height: number; factor: number }, opts: Opts): Promise<{ canvas: HTMLCanvasElement | OffscreenCanvas; factor: number }> {
  // What the network sees: the picture at a quarter of the target size.
  const iw = Math.max(1, Math.round(target.width / MODEL_SCALE));
  const ih = Math.max(1, Math.round(target.height / MODEL_SCALE));
  let pixels: ImageData;
  try {
    pixels = draw(bitmap, iw, ih, opts.background).ctx.getImageData(0, 0, iw, ih);
  } catch (e) {
    throw inStep('UpscaleDrawFailed', UPSCALE_COPY.draw, e);
  }
  let transparent = false;
  for (let i = 3; i < pixels.data.length; i += 4) {
    if (pixels.data[i]! < 255) {
      transparent = true;
      break;
    }
  }
  const up = await runOnFreshWorkerIfLost(pixels.data, iw, ih, opts);
  try {
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
  } catch (e) {
    throw inStep('UpscaleComposeFailed', UPSCALE_COPY.compose, e);
  }
}

/** The next size down after a try ran out of memory: half the scale, but never below the picture's own size; undefined when there is no smaller size to try. */
function smallerTarget(bitmap: ImageBitmap, from: number): { width: number; height: number; factor: number } | undefined {
  const next = from > 1.01 ? Math.max(1, from / 2) : undefined;
  return next === undefined || next >= from - 0.01 ? undefined : targetSize(bitmap.width, bitmap.height, next, false);
}

/**
 * Enlarge a picture by `factor` (up to 4), held under the canvas limit. The ladder, in order:
 *  1. The size asked for; on a phone or a device reporting 3 GB or less (and after a lost run in this tab) the first try is held to
 *     4.2 million pixels, and never below the picture's own size. "Try full size" turns that off.
 *  2. A worker that dies or goes silent is replaced and the same picture tried again; a second death is WorkerCrashError.
 *  3. A try that runs out of memory is made again once at half the scale (not below 1×), on a fresh worker.
 *  4. Out of memory again is OutOfMemoryError.
 * `background` fills transparent areas (for JPG); without it they stay transparent.
 */
export async function upscaleImage(bitmap: ImageBitmap, factor: number, opts: Opts = {}): Promise<UpscaleResult> {
  const light = lightNow('model') !== undefined || (!fullSizeChosen() && lowMemoryDevice());
  const full = targetSize(bitmap.width, bitmap.height, factor, false);
  const first = targetSize(bitmap.width, bitmap.height, factor, light);
  try {
    const made = await attemptAt(bitmap, first, opts);
    return { ...made, smaller: first.factor < full.factor - 0.01 ? 'device' : undefined };
  } catch (e) {
    if (!(e instanceof Error) || e.name !== 'OutOfMemoryError') throw e;
    const next = smallerTarget(bitmap, first.factor);
    if (!next) throw memoryError(e);
    // The worker that ran out of memory is not reused.
    dropWorker();
    try {
      return { ...(await attemptAt(bitmap, next, opts)), smaller: 'memory' };
    } catch (again) {
      if (again instanceof Error && again.name === 'OutOfMemoryError') throw memoryError(again);
      throw again;
    }
  }
}
