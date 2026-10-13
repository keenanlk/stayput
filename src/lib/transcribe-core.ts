/**
 * Runs OpenAI's Whisper base speech model (MIT, ONNX export from
 * onnx-community) through transformers.js (Apache-2.0) and onnxruntime-web,
 * off the main thread. The model is served from /models/whisper-base/ and
 * onnxruntime's WebAssembly from /vendor/; nothing is fetched from anywhere
 * else. The worker gets sound samples, never the file.
 *
 * Two paths share this file, chosen by the page (see speech-path.ts):
 *  - 8-bit weights, everything on WebAssembly (transcribe.worker.ts);
 *  - 16-bit encoder on WebGPU with the same 8-bit decoder on WebAssembly
 *    (transcribe-gpu.worker.ts), which makes the same words about twice as fast.
 */
import type * as Transformers from '@huggingface/transformers';
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { vendorDir } from './vendor';
import { loadWithRetry } from './retry';
import { looksLikeMemory, looksLikeNetwork, modelDownloadError, modelLoadError, outOfMemoryError, speechModelError, type SpeechError } from './speech-errors';

export const MODEL = 'whisper-base';
export const RATE = 16000;

export type Request = { id: number; audio: Float32Array; language: string | null; task: 'transcribe' | 'translate' };
export type GpuFailure = 'unsupported' | 'network' | 'init' | 'run';
export type Reply =
  | { id: number; type: 'loading'; fraction: number }
  | { id: number; type: 'result'; chunks: { start: number; end: number; text: string }[]; language: string }
  | { id: number; type: 'error'; name: string; message: string }
  /** The WebGPU path could not run; the page starts the 8-bit path instead. */
  | { id: number; type: 'gpu-failed'; reason: GpuFailure };

/**
 * The speech worker's body, over a copy of transformers.js. The two entries each bring their own:
 * the 8-bit path the stock build (WebAssembly only), the WebGPU path one wired to onnxruntime's WebGPU build.
 * Returns the function that recognises one piece of speech.
 */
export function createRecogniser({ env, pipeline, Tensor }: typeof Transformers): (req: Request, gpu: boolean) => Promise<Reply> {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/models/';
  // The model is fetched through here, so each file travels once and is kept once:
  //  - transformers.js keeps it in its Cache API store and nothing else does (the service worker
  //    leaves /models/whisper-base/ alone), so the browser's HTTP cache is skipped. Its write is
  //    a third copy of the same 77 MB made while the download streams in, and where it fails
  //    (net::ERR_CACHE_WRITE_FAILURE) the fetch fails with it.
  //  - Download progress is counted here, on the response body. Giving transformers.js a progress
  //    callback makes it first read each file's size from a plain GET of the same URL, dropping
  //    that body unread: a second 77 MB download in flight beside the real one.
  //  - The store is the same Cache API cache as before, behind a wrapper that swallows every
  //    failure (cannot open, cannot read, cannot write, storage full). A model that cannot be
  //    kept is still used for this run, straight from the network response.
  const fetchOnce = env.fetch;
  // Set when a file could not be fetched: on the WebGPU path, the one failure that says nothing about WebGPU.
  let fetchFailed = false;
  let download: { sizes: Map<string, [number, number]>; report: () => void } | undefined;
  env.fetch = async (input, init) => {
    let res: Response;
    try {
      res = (await fetchOnce(input, { ...init, cache: 'no-store' })) as Response;
    } catch (err) {
      fetchFailed = true;
      throw err;
    }
    if (!res.ok) fetchFailed = true;
    const url = String(input);
    const total = Number(res.headers.get('content-length'));
    if (!download || !res.ok || !res.body || !/\.onnx$/.test(url) || !total) return res;
    const { sizes, report } = download;
    sizes.set(url, [0, total]);
    const count = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, out) {
        sizes.set(url, [sizes.get(url)![0] + chunk.byteLength, total]);
        report();
        out.enqueue(chunk);
      },
    });
    return new Response(res.body.pipeThrough(count), { status: res.status, statusText: res.statusText, headers: res.headers });
  };
  const store = (): Promise<Cache | undefined> => (typeof caches === 'undefined' ? Promise.resolve(undefined) : caches.open(env.cacheKey).catch(() => undefined));
  env.useCustomCache = true;
  env.customCache = {
    match: async (key) => (await store().then((c) => c?.match(key)).catch(() => undefined)) ?? undefined,
    put: async (key, response) => void (await store().then((c) => c?.put(key, response)).catch(() => undefined)),
  };
  const wasm = env.backends.onnx.wasm!;
  wasm.wasmPaths = vendorDir('ort');
  // Threads need a cross-origin-isolated page, which this site is not.
  wasm.numThreads = 1;

  let asr: Promise<AutomaticSpeechRecognitionPipeline> | undefined;
  const post = (msg: Reply) => (self as unknown as Worker).postMessage(msg);


  function start(id: number, gpu: boolean): Promise<AutomaticSpeechRecognitionPipeline> {
    // The two model files make up nearly all of the download; report them together.
    const sizes = new Map<string, [number, number]>();
    download = {
      sizes,
      report() {
        let got = 0;
        let all = 0;
        for (const [l, t] of sizes.values()) {
          got += l;
          all += t;
        }
        post({ id, type: 'loading', fraction: all ? got / all : 0 });
      },
    };
    const options = gpu
      ? { dtype: { encoder_model: 'fp16', decoder_model_merged: 'q8' }, device: { encoder_model: 'webgpu', decoder_model_merged: 'wasm' } }
      : { dtype: 'q8', device: 'wasm' };
    asr ??= pipeline('automatic-speech-recognition', MODEL, options as Parameters<typeof pipeline>[2]) as Promise<AutomaticSpeechRecognitionPipeline>;
    // A failed load (offline on first use, say) may be retried by the next request.
    asr.catch(() => (asr = undefined));
    return asr;
  }

  /** Load the model; a dropped connection gets two more tries, after a short wait. */
  async function load(id: number, gpu: boolean): Promise<AutomaticSpeechRecognitionPipeline> {
    // On the WebGPU path a failure goes straight to the 8-bit path, which retries a dropped download itself.
  return gpu ? start(id, gpu) : loadWithRetry(() => start(id, gpu), looksLikeNetwork);
  }

  /** The named error for a failure while loading the model or while recognising. */
  function named(err: unknown, loading: boolean): SpeechError {
    if (looksLikeMemory(err)) return outOfMemoryError();
    if (!loading) return speechModelError();
    return looksLikeNetwork(err) ? modelDownloadError() : modelLoadError();
  }

  /**
   * The spoken language, as Whisper's two-letter code: the language token the
   * decoder scores highest straight after <|startoftranscript|>. transformers.js
   * does not detect it by itself; left alone it assumes English.
   */
  async function detectLanguage(run: AutomaticSpeechRecognitionPipeline, audio: Float32Array): Promise<string> {
    const config = run.model.generation_config as unknown as { decoder_start_token_id: number; lang_to_id: Record<string, number> };
    const { input_features } = (await run.processor(audio)) as { input_features: Transformers.Tensor };
    const start = new Tensor('int64', BigInt64Array.from([BigInt(config.decoder_start_token_id)]), [1, 1]);
    const { logits } = (await run.model({ input_features, decoder_input_ids: start })) as { logits: Transformers.Tensor };
    const scores = logits.data as Float32Array;
    let best = 'en';
    let top = -Infinity;
    for (const [token, index] of Object.entries(config.lang_to_id)) {
      if (scores[index]! > top) {
        top = scores[index]!;
        best = token.slice(2, -2);
      }
    }
    return best;
  }

  /** Recognise one piece of speech. On the WebGPU path any failure is reported as `gpu-failed`, so the page can run the piece again on the 8-bit path. */
  async function recognise({ id, audio, language, task }: Request, gpu: boolean): Promise<Reply> {
    let loading = true;
    try {
      const run = await load(id, gpu);
      loading = false;
      const spoken = language ?? (await detectLanguage(run, audio));
      const out = (await run(audio, { return_timestamps: true, language: spoken, task })) as { text: string; chunks?: { timestamp: [number, number | null]; text: string }[] };
      const seconds = audio.length / RATE;
      const chunks = (out.chunks ?? [{ timestamp: [0, seconds], text: out.text }]).map((c) => ({
        start: c.timestamp[0] ?? 0,
        end: Math.min(seconds, c.timestamp[1] ?? seconds),
        text: c.text,
      }));
      return { id, type: 'result', chunks, language: spoken };
    } catch (err) {
      // Only the class name and our own message go back; the original error is logged here for the console.
      console.error(err);
      if (gpu) return { id, type: 'gpu-failed', reason: loading ? (fetchFailed ? 'network' : 'init') : 'run' };
      const out = named(err, loading);
      return { id, type: 'error', name: out.name, message: out.message };
    }
  }

  return recognise;
}
