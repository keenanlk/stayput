/**
 * The WebGPU path of the speech worker: Whisper's encoder in 16-bit floats on
 * the graphics chip, the same 8-bit decoder as the other path on WebAssembly.
 *
 * The probe comes first, before the onnxruntime WebGPU build or any model file
 * is fetched, so a browser or machine that cannot do it never starts a download.
 * A failure anywhere after that is reported as `gpu-failed`, and the page runs
 * the piece again on the 8-bit path in a new worker.
 */
import type { Reply, Request } from './transcribe-core';

let recognise: Promise<(req: Request, gpu: boolean) => Promise<Reply>> | undefined;
let probed: Promise<boolean> | undefined;

/** A real adapter with half-float shaders, and a device it will actually hand out. */
async function probe(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(o?: object): Promise<{ features: Set<string>; requestDevice(o?: object): Promise<{ destroy(): void }> } | null> } }).gpu;
    const adapter = await gpu?.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter || !adapter.features.has('shader-f16')) return false;
    const device = await adapter.requestDevice({ requiredFeatures: ['shader-f16'] });
    device.destroy();
    return true;
  } catch {
    return false;
  }
}

/**
 * The recogniser, over a copy of transformers.js that uses onnxruntime's WebGPU build (see the
 * 'transformers-gpu' alias in astro.config.mjs). Nothing here is loaded until the probe has passed.
 */
function load() {
  return Promise.all([import('transformers-gpu'), import('./transcribe-core')]).then(([t, core]) => core.createRecogniser(t as unknown as typeof import('@huggingface/transformers')));
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const post = (msg: Reply) => (self as unknown as Worker).postMessage(msg);
  const { id } = e.data;
  try {
    if (!(await (probed ??= probe()))) return post({ id, type: 'gpu-failed', reason: 'unsupported' });
    const run = await (recognise ??= load());
    post(await run(e.data, true));
  } catch (err) {
    console.error(err);
    post({ id, type: 'gpu-failed', reason: 'init' });
  }
};
