/**
 * Writes AVIF with the jSquash encoder (libavif and libaom compiled to
 * WebAssembly, Apache-2.0), off the main thread so a long encode can be
 * cancelled by ending the worker. The single-thread build is used: the
 * multi-thread one needs a cross-origin-isolated page. The encoder is the one
 * served from /vendor/ (see src/data/vendor.json) and the pixels never leave
 * this tab.
 */
import { vendorDir } from './vendor';
import { workerFailure } from './worker-error';

export interface AvifSettings {
  /** 1..100 */
  quality: number;
  /** 1..100, or -1 to follow `quality` */
  qualityAlpha: number;
  /** 0 (slowest, smallest) to 10 (fastest) */
  speed: number;
}
export type Request = { id: number; rgba: Uint8ClampedArray; width: number; height: number } & AvifSettings;
export type Reply =
  | { id: number; type: 'done'; bytes: Uint8Array }
  | { id: number; type: 'error'; name: string; message: string };

interface AvifModule {
  encode(data: Uint8Array, width: number, height: number, options: Record<string, unknown>): Uint8Array | null;
}

let ready: Promise<{ module: AvifModule; defaults: Record<string, unknown> }> | undefined;

function load() {
  ready ??= (async () => {
    const dir = vendorDir('avifEnc');
    const [factory, utils, meta] = await Promise.all([
      import(/* @vite-ignore */ `${dir}codec/enc/avif_enc.js`),
      import(/* @vite-ignore */ `${dir}utils.js`),
      import(/* @vite-ignore */ `${dir}meta.js`),
    ]);
    const module = (await utils.initEmscriptenModule(factory.default)) as AvifModule;
    return { module, defaults: meta.defaultOptions as Record<string, unknown> };
  })();
  ready.catch(() => (ready = undefined));
  return ready;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, rgba, width, height, quality, qualityAlpha, speed } = e.data;
  try {
    const { module, defaults } = await load();
    const out = module.encode(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height, { ...defaults, quality, qualityAlpha, speed });
    if (!out) throw new Error('The AVIF encoder returned no data.');
    // Copy out of the WebAssembly heap before it is reused.
    const bytes = new Uint8Array(out);
    (self as unknown as Worker).postMessage({ id, type: 'done', bytes } satisfies Reply, [bytes.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, type: 'error', ...workerFailure(err) } satisfies Reply);
  }
};
