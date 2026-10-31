import { formatDuration } from './audio';
import { SPEECH_RATE, speechSamples } from './speech-audio';
import { toSrt, toText, toVtt, cutPoints, type Segment } from './captions';
import { suffixName, type OutputFile } from './files';
import { resumeWhenHidden } from './edit-recovery';
import { pageRecoveryHooks } from './recovery-hooks';
import { recognisePieces, type SpeechPartial } from './speech-resume';
import { fromWorker, noSpeechFound, workerCrashError } from './speech-errors';
import { isModelError, modelPreflight, uncachedBytes } from './model-fetch';
import { modelEntry } from './model-manifest';
import { cacheKeyFor } from './transcribe-core';
import { retryUrl } from './fresh-url';
import gpuWorkerUrl from './transcribe-gpu.worker.ts?worker&url';
import cpuWorkerUrl from './transcribe.worker.ts?worker&url';
import { SPEECH_MODEL_MB } from '../data/speech-size';
import { rememberTinyModel, rememberWebgpuFailure, speechModel, wantsWebgpu, type SpeechModel } from './speech-path';
import { isPhoneBrowser } from './phone-limit';
import { retryUnreadable } from './read-failure';
import type { Reply, Request } from './transcribe.worker';

/**
 * Speech in a file to timed text, for Transcribe and Add subtitles to video.
 * The sound is decoded in the tab at 16 kHz mono, cut at pauses into pieces
 * of up to 28 seconds, and each piece goes to Whisper in a worker
 * (transcribe.worker.ts). Nothing is uploaded.
 */

const RATE = SPEECH_RATE;

let modelReady = false;

let worker: Worker | undefined;
let nextId = 0;
/** Which path the live worker runs, and whether the WebGPU path has failed in this tab (then it is not tried again). */
let onGpu = false;
let gpuFailed = false;
/** The model the live worker holds. A worker keeps the one it was asked for first; another model gets a fresh worker. */
let workerModel: SpeechModel = 'whisper-base';

/** Workers started so far: a restart loads the script from a new URL (see retryUrl). */
let started = 0;

function spawn(gpu: boolean): Worker {
  onGpu = gpu;
  return new Worker(retryUrl(gpu ? gpuWorkerUrl : cpuWorkerUrl, started++), { type: 'module' });
}

/** One piece of speech through the live worker. Rejects with `GPU_FAILED` when the WebGPU path could not run it. */
function ask(audio: Float32Array, language: string | null, task: Request['task'], model: SpeechModel, onLoading: (f: number) => void): Promise<{ chunks: Segment[]; language: string }> {
  let w: Worker;
  try {
    if (worker && workerModel !== model) {
      worker.terminate();
      worker = undefined;
      modelReady = false;
    }
    // The smaller model only runs on the 8-bit path: it is the step down from memory trouble, not a speed-up.
    worker ??= spawn(model === 'whisper-base' && !gpuFailed && wantsWebgpu());
    workerModel = model;
    w = worker;
  } catch {
    return Promise.reject(workerCrashError());
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<Reply>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'loading') return onLoading(msg.fraction);
      done();
      if (msg.type === 'result') resolve({ chunks: msg.chunks, language: msg.language });
      else if (msg.type === 'gpu-failed') {
        // The worker is dropped with whatever it half-loaded; the 8-bit path starts clean in a new one.
        worker = undefined;
        w.terminate();
        gpuFailed = true;
        if (msg.reason !== 'network') rememberWebgpuFailure();
        reject(GPU_FAILED);
      } else reject(fromWorker(msg.name, msg.message));
    };
    // The worker script failed to load or the browser killed it (memory, mostly): the page's own text, never the event's.
    const onError = () => {
      done();
      worker = undefined;
      w.terminate();
      // A WebGPU worker that dies at start-up (a script that will not load, a driver crash) is not a reason to fail the run.
      if (onGpu && !modelReady) {
        gpuFailed = true;
        rememberWebgpuFailure();
        return reject(GPU_FAILED);
      }
      reject(workerCrashError());
    };
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    try {
      w.postMessage({ id, audio, language, task, model } satisfies Request, [audio.buffer]);
    } catch {
      // A worker that cannot be handed the sound (already gone) is a worker that stopped.
      done();
      worker = undefined;
      w.terminate();
      reject(workerCrashError());
    }
  });
}

const GPU_FAILED = Symbol('gpu-failed');

/**
 * Before the first piece, when the model is not kept on this device: offline or too little room to keep it ends
 * the run here as ModelOffline or StorageFull, with no request to /models/ made and no half-written cache.
 */
async function checkModelRoom(model: SpeechModel, gpu: boolean): Promise<void> {
  const dir = `/models/${model}/onnx/`;
  const files = [gpu ? 'encoder_model_fp16.onnx' : 'encoder_model_quantized.onnx', 'decoder_model_merged_quantized.onnx'].map((f) => dir + f);
  try {
    const need = await uncachedBytes(cacheKeyFor(model), files, (p) => modelEntry(p)?.size);
    if (need > 0) await modelPreflight(need, 'speech model');
  } catch (err) {
    if (isModelError(err)) throw fromWorker(err.name, err.message);
  }
}

async function recognise(audio: Float32Array, language: string | null, task: Request['task'], model: SpeechModel, onLoading: (f: number) => void): Promise<{ chunks: Segment[]; language: string }> {
  // The worker takes the samples; keep a copy only while a WebGPU attempt could still hand the piece back.
  const spare = model === 'whisper-base' && !gpuFailed && wantsWebgpu() ? audio.slice() : undefined;
  if (!modelReady) await checkModelRoom(model, spare !== undefined);
  try {
    return await ask(audio, language, task, model, onLoading);
  } catch (err) {
    if (err !== GPU_FAILED || !spare) throw err;
    // Any model the failed attempt fetched stays cached; the 8-bit path fetches only what it lacks.
    modelReady = false;
    return ask(spare, language, task, model, onLoading);
  }
}

/** Stop the speech worker and give back the memory its model holds (about 0.7 GB), for work that follows on a phone. The next run starts it again from the stored model. */
export function releaseSpeechModel() {
  // A WebGPU worker is never stopped here: stopping one while onnxruntime's session is live kills the whole
  // page in WebKit (letting go of the session first did not help). It is kept for the next run, and the
  // page's unload frees it, as on the Transcribe page.
  if (onGpu) return;
  worker?.terminate();
  worker = undefined;
}

export interface Speech {
  segments: Segment[];
  /** Language code Whisper heard (or was told), like "en". */
  language: string;
  /** Seconds. */
  duration: number;
  /** A plain sentence for the result line, only when the path or the model matters (the graphics chip stopped part-way, or the smaller model wrote the captions); otherwise ''. */
  pathNote: string;
}

/** Says something only when the run changed path part-way; a run wholly on one path needs no note. */
function pathNote(onChip: number, onCpu: number, tiny: false | 'after-failure' | 'from-start'): string {
  // Marketing's wording (STAA-398 item 6).
  if (tiny === 'after-failure') return 'This device ran short of memory, so these captions were made with the smaller speech model, which is less accurate. Check them before you use them.';
  if (tiny === 'from-start') return 'These captions were made with the smaller speech model, which is less accurate. Check them before you use them.';
  return onChip > 0 && onCpu > 0 ? 'The graphics chip stopped part-way, so the rest ran on the processor.' : '';
}

/**
 * Transcribe the speech in `file`. `language` is a Whisper code or 'auto'.
 * `onProgress` gets a message and a fraction from 0 to 1.
 */
export async function transcribeFile(
  file: File,
  opts: { language: string; task: Request['task']; format?: 'txt' | 'srt' | 'vtt'; onProgress: (message: string, fraction: number) => void },
): Promise<Speech> {
  const { onProgress } = opts;
  onProgress(`Reading the sound from ${file.name}…`, 0.02);
  const page = pageRecoveryHooks();
  let samples: Float32Array;
  try {
    // A page hidden while the sound is read starts that step again once it is back. A file the browser could not read
    // from disk is read once more before anything is said about its sound.
    samples = await resumeWhenHidden(
      () =>
        retryUnreadable(
          file,
          () => speechSamples(file, (f) => onProgress(`Reading the sound from ${file.name}…`, 0.02 + 0.03 * f)),
          (message) => onProgress(message, 0.02),
        ),
      page.hooks,
    );
  } catch (err) {
    page.dispose();
    throw err;
  }
  const total = samples.length / RATE;
  if (total < 0.5) {
    page.dispose();
    throw noSpeechFound('The recording is too short to hold any speech.');
  }
  const cuts = [0, ...cutPoints(samples, RATE), samples.length];
  // Phones at risk of running out of memory start with the smaller model; a memory death with the base one steps down to it.
  const startModel = speechModel(undefined, file.size);
  const startedTiny = startModel === 'whisper-tiny';
  let onChip = 0;
  let onCpu = 0;
  try {
    const run = await recognisePieces(
      samples,
      cuts,
      RATE,
      file.name,
      { language: opts.language === 'auto' ? null : opts.language, task: opts.task, model: startModel },
      {
        recognise: (piece, language, model, onLoading) => recognise(piece, language, opts.task, model, onLoading),
        release: releaseSpeechModel,
        pause: (ms) => new Promise((done) => setTimeout(done, ms)),
        page: page.hooks,
        stepDown: (err, model) => {
          // A phone whose base model died of memory keeps the smaller one for the rest of this tab.
          const memoryDeath = err.name === 'OutOfMemoryError' || err.name === 'WorkerCrashError';
          const step = memoryDeath && model === 'whisper-base' && isPhoneBrowser();
          if (step) rememberTinyModel();
          return step;
        },
        time: formatDuration,
        onProgress,
        onLoading: (model, f) => {
          if (!modelReady) onProgress(`Downloading the speech model, once (${model === 'whisper-tiny' ? SPEECH_MODEL_MB.tiny : onGpu ? SPEECH_MODEL_MB.webgpu : SPEECH_MODEL_MB.q8} MB): ${Math.round(f * 100)}%`, 0.05 * f);
        },
        onPiece: () => {
          modelReady = true;
          if (onGpu) onChip++;
          else onCpu++;
        },
        // The worker that died took its loaded model with it; the next one starts it from the store.
        onResume: () => {
          modelReady = false;
        },
      },
    );
    return { segments: run.segments, language: run.language!, duration: total, pathNote: pathNote(onChip, onCpu, run.steppedDown ? 'after-failure' : startedTiny ? 'from-start' : false) };
  } catch (err) {
    // What was recognised before the failure goes out with it, in the format the tool writes.
    const partial = (err as { partial?: SpeechPartial } | null)?.partial;
    if (partial && err instanceof Error) Object.assign(err, { salvage: [partialOutput(file, partial, opts.format ?? 'srt')] });
    throw err;
  } finally {
    page.dispose();
  }
}

const PARTIAL_TYPE = { txt: 'text/plain', srt: 'application/x-subrip', vtt: 'text/vtt' } as const;

/** The transcript of the pieces that finished, labelled as partial. */
function partialOutput(file: File, p: SpeechPartial, format: 'txt' | 'srt' | 'vtt'): OutputFile {
  const body = format === 'srt' ? toSrt(p.segments) : format === 'vtt' ? toVtt(p.segments) : toText(p.segments);
  return {
    name: suffixName(file.name, '-partial', format),
    blob: new Blob([body], { type: `${PARTIAL_TYPE[format]};charset=utf-8` }),
    originalSize: file.size,
    note: `Partial: speech up to ${formatDuration(p.upTo)} of ${formatDuration(p.total)}.`,
    text: body,
  };
}
