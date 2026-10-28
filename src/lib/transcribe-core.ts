/**
 * Runs OpenAI's Whisper base speech model (MIT, ONNX export from
 * onnx-community) through transformers.js (Apache-2.0) and onnxruntime-web,
 * off the main thread. The model is served from /models/whisper-base/ (or whisper-tiny/ on a phone short of memory) and
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
import { fetchResumable, wholeOrNull } from './model-fetch';
import { isRecordingTooLong, looksLikeMemory, looksLikeNetwork, modelDownloadError, modelLoadError, outOfMemoryError, speechModelError, type SpeechError } from './speech-errors';

/** The models this worker can run, each with its own folder under /models/ and its own Cache API store. */
export type ModelName = 'whisper-base' | 'whisper-tiny';
/** transformers.js's own store name stays for base, so models already kept on devices are still found. */
export const cacheKeyFor = (model: ModelName): string => (model === 'whisper-tiny' ? 'transformers-cache-whisper-tiny' : 'transformers-cache');
export const RATE = 16000;

export type Request = { id: number; audio: Float32Array; language: string | null; task: 'transcribe' | 'translate'; model: ModelName };
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
  //  - Each file is read to its last byte here, resuming a dropped connection (see model-fetch.ts),
  //    so what transformers.js receives, and caches, is always the whole file.
  env.fetch = async (input, init) => {
    const url = String(input);
    const counted = download && /\.onnx$/.test(url) ? download : undefined;
    const onProgress = counted && ((got: number, total: number) => total && (counted.sizes.set(url, [got, total]), counted.report()));
    let res: Response;
    try {
      res = await fetchResumable((i, o) => fetchOnce(i as string | URL, { ...o, cache: 'no-store' }) as Promise<Response>, url, init, onProgress);
    } catch (err) {
      fetchFailed = true;
      throw err;
    }
    if (!res.ok) fetchFailed = true;
    return res;
  };
  const store = (): Promise<Cache | undefined> => (typeof caches === 'undefined' ? Promise.resolve(undefined) : caches.open(env.cacheKey).catch(() => undefined));
  env.useCustomCache = true;
  env.customCache = {
    // A kept file that is not the size it promises is dropped and fetched again.
    match: async (key) => {
      try {
        const cache = await store();
        const hit = await cache?.match(key);
        if (!hit) return undefined;
        const whole = await wholeOrNull(hit);
        if (!whole) await cache!.delete(key);
        return whole ?? undefined;
      } catch {
        return undefined;
      }
    },
    // Only a whole file is written.
    put: async (key, response) => {
      try {
        const whole = await wholeOrNull(response);
        if (whole) await (await store())?.put(key, whole);
      } catch {
        // A model that cannot be kept is still used for this run.
      }
    },
  };
  /** Drop every kept file of one model, so the next load of it downloads them again; the other model's files stay. */
  const evict = (model: ModelName) => (typeof caches === 'undefined' ? Promise.resolve(false) : caches.delete(cacheKeyFor(model))).catch(() => false);
  const wasm = env.backends.onnx.wasm!;
  wasm.wasmPaths = vendorDir('ort');
  // Threads need a cross-origin-isolated page, which this site is not.
  wasm.numThreads = 1;

  // One pipeline per model.
  const pipelines = new Map<ModelName, Promise<AutomaticSpeechRecognitionPipeline>>();
  const post = (msg: Reply) => (self as unknown as Worker).postMessage(msg);


  function start(id: number, gpu: boolean, model: ModelName): Promise<AutomaticSpeechRecognitionPipeline> {
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
    // The store is read at each fetch, so it is set to this model's before the load starts.
    env.cacheKey = cacheKeyFor(model);
    let asr = pipelines.get(model);
    if (!asr) {
      asr = pipeline('automatic-speech-recognition', model, options as Parameters<typeof pipeline>[2]) as Promise<AutomaticSpeechRecognitionPipeline>;
      pipelines.set(model, asr);
      // A failed load (offline on first use, say) may be retried by the next request.
      const failed = asr;
      failed.catch(() => pipelines.get(model) === failed && pipelines.delete(model));
    }
    return asr;
  }

  /**
   * Load the model; a dropped connection gets two more tries, after a short wait. A model that will
   * not start (a RangeError from a bad buffer, a parse error) may be a damaged kept copy, so the kept
   * files are dropped before the error goes back; the page then starts a fresh worker, which downloads
   * them again (this worker's runtime is not trusted after a failed start).
   */
  async function load(id: number, gpu: boolean, model: ModelName): Promise<AutomaticSpeechRecognitionPipeline> {
    // On the WebGPU path a failure goes straight to the 8-bit path, which retries a dropped download itself
    // and keeps the files: a WebGPU that will not start says nothing about them.
    if (gpu) return start(id, gpu, model);
    try {
      return await loadWithRetry(() => start(id, gpu, model), looksLikeNetwork);
    } catch (err) {
      if (!looksLikeNetwork(err) && !looksLikeMemory(err)) await evict(model);
      throw err;
    }
  }

  /** The named error for a failure while loading the model or while recognising. */
  function named(err: unknown, loading: boolean): SpeechError {
    if (isRecordingTooLong(err)) return err as SpeechError;
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
  async function recognise({ id, audio, language, task, model }: Request, gpu: boolean): Promise<Reply> {
    let loading = true;
    try {
      const run = await load(id, gpu, model);
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
