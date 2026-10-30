/**
 * Object removal in the browser with MI-GAN (Picsart AI Research, MIT), a
 * small inpainting network: paint over something and it fills the area with
 * what plausibly lies behind it. The model runs in a web worker
 * (inpaint.worker.ts); only the painted pixels are replaced, the rest of the
 * picture is copied through untouched. The caller hands over just the painted
 * region of the picture, so memory follows the paint, not the photo.
 */
import { fromWorkerFailure } from './worker-error';
import { NamedError } from './input-error';
import { RUN_STALL_MS } from './encoder-watchdog';

let worker: Worker | undefined;
let nextId = 0;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./inpaint.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** Stop the current worker for good; the next request starts a new one. */
function dropWorker() {
  worker?.terminate();
  worker = undefined;
}

/** The worker died, or went silent, rather than answering: the one failure that is tried again on a new worker. */
class WorkerGone extends Error {}

export const workerCrashError = () =>
  new NamedError('WorkerCrashError', 'The object remover stopped unexpectedly, which usually means the browser ran short of memory. Close other tabs and try again, or paint a smaller area.');

type Opts = { onLoading?: (f: number) => void; onWorking?: () => void; /** Only tests pass this. */ silentMs?: number };

function attempt(rgba: Uint8ClampedArray, hole: Uint8Array, width: number, height: number, opts: Opts): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = getWorker();
    } catch (e) {
      return reject(new WorkerGone(e instanceof Error ? e.message : 'The object remover could not start in this browser.'));
    }
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const settle = (finish: () => void) => {
      clearTimeout(watchdog);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      finish();
    };
    // Once the model is working it sends nothing until it is done, so only a long silence means it is stuck.
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => settle(() => reject(new WorkerGone('The object remover stopped answering.'))), opts.silentMs ?? RUN_STALL_MS);
    };
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { id: number; type: string; fraction?: number; rgba?: Uint8ClampedArray<ArrayBuffer>; name?: string; message?: string };
      if (msg.id !== id) return;
      if (msg.type === 'loading') {
        arm();
        return opts.onLoading?.(msg.fraction ?? 0);
      }
      if (msg.type === 'working') {
        arm();
        return opts.onWorking?.();
      }
      settle(() => {
        if (msg.type === 'done') return resolve(msg.rgba!);
        // A stalled download leaves the worker half-way through a fetch: start the next try from a clean one.
        if (msg.name === 'ModelDownloadStalled') dropWorker();
        reject(fromWorkerFailure(msg.name, msg.message ?? 'Removing the object failed.'));
      });
    };
    const onError = (e: ErrorEvent) => settle(() => reject(new WorkerGone(e.message || 'The object remover stopped.')));
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    arm();
    // Copied, not transferred, so the same region can be sent again to a new worker.
    w.postMessage({ id, type: 'inpaint', rgba, hole, width, height });
  });
}

/**
 * Fill the pixels where `hole` is non-zero in a width × height region. A new buffer comes back; the arguments are kept.
 * If the worker crashes or goes silent, it is replaced and the same region is tried once more; a second crash is
 * WorkerCrashError.
 */
export async function inpaint(rgba: Uint8ClampedArray, hole: Uint8Array, width: number, height: number, opts: Opts = {}): Promise<Uint8ClampedArray<ArrayBuffer>> {
  try {
    return await attempt(rgba, hole, width, height, opts);
  } catch (e) {
    if (!(e instanceof WorkerGone)) throw e;
  }
  dropWorker();
  try {
    return await attempt(rgba, hole, width, height, opts);
  } catch (e) {
    if (!(e instanceof WorkerGone)) throw e;
    dropWorker();
    const err = workerCrashError();
    err.cause = e;
    throw err;
  }
}
