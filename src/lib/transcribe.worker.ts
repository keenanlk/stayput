/**
 * Runs OpenAI's Whisper base speech model (Apache-2.0, ONNX export from
 * onnx-community, 8-bit weights) through transformers.js (Apache-2.0) and
 * onnxruntime-web, off the main thread. The model is served from
 * /models/whisper-base/ and onnxruntime's WebAssembly from /vendor/; nothing
 * is fetched from anywhere else. The worker gets sound samples, never the file.
 */
import { env, pipeline, Tensor, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { vendorDir } from './vendor';
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
const wasm = env.backends.onnx.wasm!;
wasm.wasmPaths = vendorDir('ort');
// Threads need a cross-origin-isolated page, which this site is not.
wasm.numThreads = 1;

let asr: Promise<AutomaticSpeechRecognitionPipeline> | undefined;
const post = (msg: Reply) => (self as unknown as Worker).postMessage(msg);

function start(id: number): Promise<AutomaticSpeechRecognitionPipeline> {
  // The two model files make up nearly all of the download; report them together.
  const sizes = new Map<string, [number, number]>();
  asr ??= pipeline('automatic-speech-recognition', MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      sizes.set(p.file, [p.loaded ?? 0, p.total]);
      let got = 0;
      let all = 0;
      for (const [l, t] of sizes.values()) {
        got += l;
        all += t;
      }
      post({ id, type: 'loading', fraction: all ? got / all : 0 });
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
  // A failed load (offline on first use, say) may be retried by the next request.
  asr.catch(() => (asr = undefined));
  return asr;
}

/** Load the model; when the browser's storage is full, once more without caching it, and a dropped connection once more too. */
async function load(id: number): Promise<AutomaticSpeechRecognitionPipeline> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await start(id);
    } catch (err) {
      if (attempt >= 1) throw err;
      if ((err as { name?: string })?.name === 'QuotaExceededError') env.useBrowserCache = false;
      else if (!looksLikeNetwork(err)) throw err;
    }
  }
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
