/**
 * Splits a song into instrumental and vocals off the main thread with
 * UVR-MDX-NET-Inst_HQ_3, an MDX-Net model from Ultimate Vocal Remover. The
 * spectrogram maths is in mdx.ts; the network runs through onnxruntime-web on
 * the GPU (WebGPU) where the browser offers it, which is many times faster,
 * and on the CPU (WebAssembly) otherwise. Both builds are served from /vendor/
 * and the model from /models/, fetched on first use only. The worker sees
 * decoded samples, never the file.
 */
import type { InferenceSession, Tensor } from 'onnxruntime-web';
import { vendorDir } from './vendor';
import { INST_HQ_3, Mdx, separate } from './mdx';

export const MODEL_URL = '/models/uvr-mdx-net-inst-hq-3.onnx';
/** The model's instrumental comes out slightly quiet; UVR scales it by this. */
const COMPENSATE = 1.022;

export type Request = { id: number; left: Float32Array; right: Float32Array; gpu: boolean };
export type Reply =
  | { id: number; type: 'loading'; fraction: number }
  | { id: number; type: 'progress'; done: number; total: number; engine: 'gpu' | 'cpu' }
  | { id: number; type: 'done'; left: Float32Array; right: Float32Array; engine: 'gpu' | 'cpu' }
  | { id: number; type: 'error'; message: string };

type Ort = typeof import('onnxruntime-web');
interface Loaded { ort: Ort; session: InferenceSession; engine: 'gpu' | 'cpu' }
let loaded: Promise<Loaded> | undefined;

async function fetchModel(onProgress: (f: number) => void): Promise<Uint8Array> {
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`The separation model could not be downloaded (HTTP ${res.status}). Check your connection and try again.`);
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

async function hasGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function load(wantGpu: boolean, onProgress: (f: number) => void): Promise<Loaded> {
  loaded ??= (async () => {
    const model = await fetchModel(onProgress);
    if (wantGpu && (await hasGpu())) {
      try {
        const ort = (await import('ort-webgpu')) as unknown as Ort;
        ort.env.wasm.wasmPaths = vendorDir('ort');
        ort.env.wasm.numThreads = 1;
        const session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
        return { ort, session, engine: 'gpu' as const };
      } catch (e) {
        // A GPU that cannot run the model (old drivers, too little memory): fall back to the CPU.
        console.warn('WebGPU unavailable for the vocal remover, using the CPU', e);
      }
    }
    const ort = (await import('onnxruntime-web/wasm')) as unknown as Ort;
    ort.env.wasm.wasmPaths = vendorDir('ort');
    // Threads need a cross-origin-isolated page, which this site is not.
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { ort, session, engine: 'cpu' as const };
  })();
  loaded.catch(() => (loaded = undefined));
  return loaded;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, left, right, gpu } = e.data;
  const post = (msg: Reply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
  try {
    const { ort, session, engine } = await load(gpu, (fraction) => post({ id, type: 'loading', fraction }));
    const mdx = new Mdx(INST_HQ_3);
    const { dimF, dimT } = INST_HQ_3;
    const input = session.inputNames[0]!;
    const output = session.outputNames[0]!;
    post({ id, type: 'progress', done: 0, total: 1, engine });
    const [l, r] = await separate(
      left,
      right,
      mdx,
      async (spec) => {
        const result = await session.run({ [input]: new ort.Tensor('float32', spec, [1, 4, dimF, dimT]) });
        const t = result[output] as Tensor;
        const data = (await t.getData()) as Float32Array;
        t.dispose?.();
        return data;
      },
      (done, total) => post({ id, type: 'progress', done, total, engine }),
    );
    for (let i = 0; i < l.length; i++) {
      l[i]! *= COMPENSATE;
      r[i]! *= COMPENSATE;
    }
    post({ id, type: 'done', left: l, right: r, engine }, [l.buffer, r.buffer]);
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
