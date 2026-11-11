/**
 * Runs Real-ESRGAN (general x4v3) off the main thread. The picture arrives as
 * RGBA pixels and goes through the network in overlapping tiles, so memory
 * stays small whatever the picture's size; each tile's padding is cut away so
 * the seams do not show. onnxruntime-web's WebAssembly build is served from
 * /vendor/ and the model from /models/; both are fetched on the first request
 * only. The worker never sees the file itself.
 */
import * as ort from 'onnxruntime-web/wasm';
import { vendorDir } from './vendor';
import { workerFailure } from './worker-error';
import { NamedError } from './input-error';
import { loadModelBytes } from './model-fetch';
import { modelEntry } from './model-manifest';

export const MODEL_URL = '/models/realesr-general-x4v3.onnx';
export const SCALE = 4;
const TILE = 128;
const PAD = 10;

export type Request = { id: number; type: 'upscale'; rgba: Uint8ClampedArray; width: number; height: number };
export type Reply =
  | { id: number; type: 'loading'; fraction: number }
  | { id: number; type: 'working' }
  | { id: number; type: 'progress'; fraction: number }
  | { id: number; type: 'done'; rgba: Uint8ClampedArray; width: number; height: number }
  | { id: number; type: 'error'; name: string; message: string };

let session: Promise<ort.InferenceSession> | undefined;

/** The model, whole and checked: a kept copy that still matches the manifest, else a resumed, size- and hash-checked download (see model-fetch.ts). */
const fetchModel = (onProgress: (f: number) => void): Promise<Uint8Array> =>
  loadModelBytes(MODEL_URL, {
    label: { model: 'upscaling model', size: '4.9 MB' },
    entry: modelEntry(MODEL_URL),
    onProgress,
    onKeepFailed: (err) => console.warn('The upscaling model could not be kept for next time', err),
  });

function load(onProgress: (f: number) => void): Promise<ort.InferenceSession> {
  session ??= (async () => {
    ort.env.wasm.wasmPaths = vendorDir('ort');
    // Threads need a cross-origin-isolated page, which this site is not.
    ort.env.wasm.numThreads = 1;
    const model = await fetchModel(onProgress);
    try {
      return await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    } catch (err) {
      // A file that downloaded whole but will not start: out of memory when it says so, else the load itself.
      const f = failure(err, 'ModelLoadError');
      throw new NamedError(f.name, f.message);
    }
  })();
  // A failed load (offline on first use, say) may be retried by the next request.
  session.catch(() => (session = undefined));
  return session;
}

/** workerFailure, with a RangeError (a buffer that could not be made) counted as memory like the engine's own messages. */
function failure(err: unknown, step: string): { name: string; message: string } {
  if (err instanceof RangeError) return { name: 'OutOfMemoryError', message: err.message };
  return workerFailure(err, step);
}

async function upscale(s: ort.InferenceSession, rgba: Uint8ClampedArray, W: number, H: number, onProgress: (f: number) => void): Promise<Uint8ClampedArray> {
  const OW = W * SCALE;
  const OH = H * SCALE;
  const out = new Uint8ClampedArray(OW * OH * 4);
  const cols = Math.ceil(W / TILE);
  const rows = Math.ceil(H / TILE);
  let done = 0;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      // The tile, plus a margin of real neighbouring pixels on every side the picture allows.
      const x0 = tx * TILE, y0 = ty * TILE;
      const x1 = Math.min(W, x0 + TILE), y1 = Math.min(H, y0 + TILE);
      const px0 = Math.max(0, x0 - PAD), py0 = Math.max(0, y0 - PAD);
      const px1 = Math.min(W, x1 + PAD), py1 = Math.min(H, y1 + PAD);
      const tw = px1 - px0, th = py1 - py0;
      const plane = tw * th;
      const input = new Float32Array(3 * plane);
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const si = ((py0 + y) * W + px0 + x) * 4;
          const di = y * tw + x;
          input[di] = rgba[si]! / 255;
          input[plane + di] = rgba[si + 1]! / 255;
          input[2 * plane + di] = rgba[si + 2]! / 255;
        }
      }
      const res = await s.run({ [s.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, th, tw]) });
      const o = res[s.outputNames[0]!]!.data as Float32Array;
      const otw = tw * SCALE, oplane = otw * th * SCALE;
      // Copy back only the tile itself, not its margin.
      for (let y = (y0 - py0) * SCALE; y < (y1 - py0) * SCALE; y++) {
        for (let x = (x0 - px0) * SCALE; x < (x1 - px0) * SCALE; x++) {
          const si = y * otw + x;
          const di = ((py0 * SCALE + y) * OW + px0 * SCALE + x) * 4;
          out[di] = o[si]! * 255;
          out[di + 1] = o[oplane + si]! * 255;
          out[di + 2] = o[2 * oplane + si]! * 255;
          out[di + 3] = 255;
        }
      }
      onProgress(++done / (cols * rows));
    }
  }
  return out;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, rgba, width, height } = e.data;
  const post = (msg: Reply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
  try {
    // The page waits for a first word, so a worker that never starts is told apart from one that is downloading.
    post({ id, type: 'loading', fraction: 0 });
    const s = await load((fraction) => post({ id, type: 'loading', fraction }));
    post({ id, type: 'working' });
    let result: Uint8ClampedArray;
    try {
      result = await upscale(s, rgba, width, height, (fraction) => post({ id, type: 'progress', fraction }));
    } catch (err) {
      const f = failure(err, 'UpscaleRunFailed');
      throw new NamedError(f.name, f.message);
    }
    post({ id, type: 'done', rgba: result, width: width * SCALE, height: height * SCALE }, [result.buffer]);
  } catch (err) {
    post({ id, type: 'error', ...workerFailure(err, 'UpscaleRunFailed') });
  }
};
