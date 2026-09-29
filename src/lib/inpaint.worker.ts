/**
 * Runs MI-GAN (Picsart AI Research, MIT) off the main thread. The authors'
 * pipeline model takes the whole picture and a mask as 8-bit pixels, crops
 * around the masked part, fills it and blends the fill back, so the worker
 * only reorders pixels. onnxruntime-web's WebAssembly build is served from
 * /vendor/ and the model from /models/; both are fetched on the first request
 * only. The worker never sees the file itself.
 */
import * as ort from 'onnxruntime-web/wasm';
import { vendorDir } from './vendor';

export const MODEL_URL = '/models/migan-pipeline-v2.onnx';

/** `hole` has one byte per pixel, non-zero where the picture should be filled in. */
export type Request = { id: number; type: 'inpaint'; rgba: Uint8ClampedArray; hole: Uint8Array; width: number; height: number };
export type Reply =
  | { id: number; type: 'loading'; fraction: number }
  | { id: number; type: 'working' }
  | { id: number; type: 'done'; rgba: Uint8ClampedArray; width: number; height: number }
  | { id: number; type: 'error'; message: string };

let session: Promise<ort.InferenceSession> | undefined;

async function fetchModel(onProgress: (f: number) => void): Promise<Uint8Array> {
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`The object removal model could not be downloaded (HTTP ${res.status}). Check your connection and try again.`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress(Math.min(1, got / total));
  }
  const bytes = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    bytes.set(p, o);
    o += p.length;
  }
  return bytes;
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

async function inpaint(s: ort.InferenceSession, rgba: Uint8ClampedArray, hole: Uint8Array, W: number, H: number): Promise<Uint8ClampedArray> {
  const plane = W * H;
  const image = new Uint8Array(3 * plane);
  // The model's mask is 255 where the picture is kept and 0 where it fills in.
  const mask = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) {
    image[i] = rgba[i * 4]!;
    image[plane + i] = rgba[i * 4 + 1]!;
    image[2 * plane + i] = rgba[i * 4 + 2]!;
    mask[i] = hole[i] ? 0 : 255;
  }
  const res = await s.run({
    image: new ort.Tensor('uint8', image, [1, 3, H, W]),
    mask: new ort.Tensor('uint8', mask, [1, 1, H, W]),
  });
  const o = res[s.outputNames[0]!]!.data as Uint8Array;
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < plane; i++) {
    if (!hole[i]) continue;
    out[i * 4] = o[i]!;
    out[i * 4 + 1] = o[plane + i]!;
    out[i * 4 + 2] = o[2 * plane + i]!;
    // A filled-in hole in a transparent picture becomes solid.
    out[i * 4 + 3] = 255;
  }
  return out;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, rgba, hole, width, height } = e.data;
  const post = (msg: Reply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
  try {
    const s = await load((fraction) => post({ id, type: 'loading', fraction }));
    post({ id, type: 'working' });
    const result = await inpaint(s, rgba, hole, width, height);
    post({ id, type: 'done', rgba: result, width, height }, [result.buffer]);
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
