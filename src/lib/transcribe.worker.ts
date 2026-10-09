/**
 * Runs OpenAI's Whisper base speech model (Apache-2.0, ONNX export from
 * onnx-community, 8-bit weights) through transformers.js (Apache-2.0) and
 * onnxruntime-web, off the main thread. The model is served from
 * /models/whisper-base/ and onnxruntime's WebAssembly from /vendor/; nothing
 * is fetched from anywhere else. The worker gets sound samples, never the file.
 */
import { env, pipeline, Tensor, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { vendorDir } from './vendor';
import { loadWithRetry } from './retry';
import { looksLikeMemory, looksLikeNetwork, modelDownloadError, modelLoadError, outOfMemoryError, speechModelError, type SpeechError } from './speech-errors';

export const MODEL = 'whisper-base';
export const RATE = 16000;

export type Request = { id: number; audio: Float32Array; language: string | null; task: 'transcribe' | 'translate' };
export type Reply =
  | { id: number; type: 'loading'; fraction: number }
  | { id: number; type: 'result'; chunks: { start: number; end: number; text: string }[]; language: string }
  | { id: number; type: 'error'; name: string; message: string };

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';
// The model is fetched through here, so each file travels once and is kept once:
//  - transformers.js keeps it in its Cache API store and nothing else does (the service worker
//    leaves /models/whisper-base/ alone), so the browser's HTTP cache is skipped. Its write is
//    a third copy of the same 76 MB made while the download streams in, and where it fails
//    (net::ERR_CACHE_WRITE_FAILURE) the fetch fails with it.
//  - Download progress is counted here, on the response body. Giving transformers.js a progress
//    callback makes it first read each file's size from a plain GET of the same URL, dropping
//    that body unread: a second 76 MB download in flight beside the real one.
//  - The store is the same Cache API cache as before, behind a wrapper that swallows every
//    failure (cannot open, cannot read, cannot write, storage full). A model that cannot be
//    kept is still used for this run, straight from the network response.
const fetchOnce = env.fetch;
let download: { sizes: Map<string, [number, number]>; report: () => void } | undefined;
env.fetch = async (input, init) => {
  const res = (await fetchOnce(input, { ...init, cache: 'no-store' })) as Response;
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

function start(id: number): Promise<AutomaticSpeechRecognitionPipeline> {
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
  asr ??= pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8', device: 'wasm' }) as Promise<AutomaticSpeechRecognitionPipeline>;
  // A failed load (offline on first use, say) may be retried by the next request.
  asr.catch(() => (asr = undefined));
  return asr;
}

/** Load the model; a dropped connection gets two more tries, after a short wait. */
async function load(id: number): Promise<AutomaticSpeechRecognitionPipeline> {
  return loadWithRetry(() => start(id), looksLikeNetwork);
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
  const { input_features } = (await run.processor(audio)) as { input_features: Tensor };
  const start = new Tensor('int64', BigInt64Array.from([BigInt(config.decoder_start_token_id)]), [1, 1]);
  const { logits } = (await run.model({ input_features, decoder_input_ids: start })) as { logits: Tensor };
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

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, audio, language, task } = e.data;
  let loading = true;
  try {
    const run = await load(id);
    loading = false;
    const spoken = language ?? (await detectLanguage(run, audio));
    const out = (await run(audio, { return_timestamps: true, language: spoken, task })) as { text: string; chunks?: { timestamp: [number, number | null]; text: string }[] };
    const seconds = audio.length / RATE;
    const chunks = (out.chunks ?? [{ timestamp: [0, seconds], text: out.text }]).map((c) => ({
      start: c.timestamp[0] ?? 0,
      end: Math.min(seconds, c.timestamp[1] ?? seconds),
      text: c.text,
    }));
    post({ id, type: 'result', chunks, language: spoken });
  } catch (err) {
    // Only the class name and our own message go back; the original error is logged here for the console.
    console.error(err);
    const out = named(err, loading);
    post({ id, type: 'error', name: out.name, message: out.message });
  }
};
