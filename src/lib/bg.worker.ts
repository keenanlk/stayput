/**
 * Runs the background-removal model off the main thread, so the page keeps
 * responding during the few seconds a photo takes. onnxruntime-web's
 * WebAssembly build is served from /vendor/ and the model from /models/; both
 * are fetched on the first request only. The worker gets pixels and returns a
 * mask; it never sees the file itself.
 */
import * as ort from 'onnxruntime-web/wasm';
import { vendorDir } from './vendor';
import { workerFailure } from './worker-error';
import { fetchModelBytes } from './model-stall';

export const MODEL_URL = '/models/isnet-general-use-int8w.onnx';
export const SIZE = 1024;

export type Request = { id: number; type: 'mask'; pixels: Float32Array };
export type Reply =
  | { id: number; type: 'loading'; fraction: number }
  | { id: number; type: 'mask'; mask: Uint8ClampedArray }
  | { id: number; type: 'error'; name: string; message: string };

let session: Promise<ort.InferenceSession> | undefined;

function fetchModel(onProgress: (f: number) => void): Promise<Uint8Array> {
  return fetchModelBytes(MODEL_URL, 'background model', onProgress);
}

function load(onProgress: (f: number) => void): Promise<ort.InferenceSession> {
  session ??= (async () => {
    ort.env.wasm.wasmPaths = vendorDir('ort');
    // Threads need a cross-origin-isolated page, which this site is not.
    ort.env.wasm.numThreads = 1;
    const model = await fetchModel(onProgress);
    return ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })();
  // A failed load (offline on first use, say) may be retried by the next request.
  session.catch(() => (session = undefined));
  return session;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, pixels } = e.data;
  const post = (msg: Reply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
  // A failure with no name of its own (onnxruntime throws plain Errors and bare numbers) is recorded as the step it came from.
  let step = 'BackgroundModelLoadFailed';
  try {
    const s = await load((fraction) => post({ id, type: 'loading', fraction }));
    step = 'BackgroundModelRunFailed';
    const input = new ort.Tensor('float32', pixels, [1, 3, SIZE, SIZE]);
    const out = await s.run({ [s.inputNames[0]!]: input });
    const data = out[s.outputNames[0]!]!.data as Float32Array;
    // Stretch the prediction to the full 0..1 range, as the model's authors do.
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of data) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo || 1;
    const mask = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i++) mask[i] = ((data[i]! - lo) / span) * 255;
    post({ id, type: 'mask', mask }, [mask.buffer]);
  } catch (err) {
    post({ id, type: 'error', ...workerFailure(err, step) });
  }
};
