/**
 * Object removal in the browser with MI-GAN (Picsart AI Research, MIT), a
 * small inpainting network: paint over something and it fills the area with
 * what plausibly lies behind it. The model runs in a web worker
 * (inpaint.worker.ts); only the painted pixels are replaced, the rest of the
 * picture is copied through untouched.
 */
let worker: Worker | undefined;
let nextId = 0;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./inpaint.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/**
 * Fill the pixels where `hole` is non-zero. `rgba` is transferred to the
 * worker and a new buffer comes back.
 */
export function inpaint(rgba: Uint8ClampedArray, hole: Uint8Array, width: number, height: number, opts: { onLoading?: (f: number) => void; onWorking?: () => void } = {}): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const id = nextId++;
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { id: number; type: string; fraction?: number; rgba?: Uint8ClampedArray<ArrayBuffer>; message?: string };
      if (msg.id !== id) return;
      if (msg.type === 'loading') return opts.onLoading?.(msg.fraction ?? 0);
      if (msg.type === 'working') return opts.onWorking?.();
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (msg.type === 'done') resolve(msg.rgba!);
      else reject(new Error(msg.message ?? 'Removing the object failed.'));
    };
    const onError = (e: ErrorEvent) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      worker = undefined;
      reject(new Error(e.message || 'The object remover could not start in this browser.'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, type: 'inpaint', rgba, hole, width, height }, [rgba.buffer, hole.buffer]);
  });
}
