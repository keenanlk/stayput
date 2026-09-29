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

export const MODEL_URL = '/models/realesr-general-x4v3.onnx';
export const SCALE = 4;
const TILE = 128;
const PAD = 10;

export type Request = { id: number; type: 'upscale'; rgba: Uint8ClampedArray; width: number; height: number };
export type Reply =
  | { id: number; type: 'loading'; fraction: number }
  | { id: number; type: 'progress'; fraction: number }
  | { id: number; type: 'done'; rgba: Uint8ClampedArray; width: number; height: number }
  | { id: number; type: 'error'; message: string };

let session: Promise<ort.InferenceSession> | undefined;

async function fetchModel(onProgress: (f: number) => void): Promise<Uint8Array> {
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`The upscaling model could not be downloaded (HTTP ${res.status}). Check your connection and try again.`);
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
    const s = await load((fraction) => post({ id, type: 'loading', fraction }));
    const result = await upscale(s, rgba, width, height, (fraction) => post({ id, type: 'progress', fraction }));
    post({ id, type: 'done', rgba: result, width: width * SCALE, height: height * SCALE }, [result.buffer]);
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
