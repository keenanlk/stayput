import { formatDuration } from './audio';
import { SPEECH_RATE, speechSamples } from './speech-audio';
import { clean, cutPoints, type Segment } from './captions';
import { fromWorker, noSpeechFound, restartsOnce, workerCrashError } from './speech-errors';
import { SPEECH_MODEL_MB } from '../data/speech-size';
import { rememberWebgpuFailure, wantsWebgpu } from './speech-path';
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

function spawn(gpu: boolean): Worker {
  onGpu = gpu;
  return gpu
    ? new Worker(new URL('./transcribe-gpu.worker.ts', import.meta.url), { type: 'module' })
    : new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });
}

/** One piece of speech through the live worker. Rejects with `GPU_FAILED` when the WebGPU path could not run it. */
function ask(audio: Float32Array, language: string | null, task: Request['task'], onLoading: (f: number) => void): Promise<{ chunks: Segment[]; language: string }> {
  let w: Worker;
  try {
    worker ??= spawn(!gpuFailed && wantsWebgpu());
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
      w.postMessage({ id, audio, language, task } satisfies Request, [audio.buffer]);
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

async function recognise(audio: Float32Array, language: string | null, task: Request['task'], onLoading: (f: number) => void): Promise<{ chunks: Segment[]; language: string }> {
  // The worker takes the samples; keep a copy only while a WebGPU attempt could still hand the piece back.
  const spare = !gpuFailed && wantsWebgpu() ? audio.slice() : undefined;
  try {
    return await ask(audio, language, task, onLoading);
  } catch (err) {
    if (err !== GPU_FAILED || !spare) throw err;
    // Any model the failed attempt fetched stays cached; the 8-bit path fetches only what it lacks.
    modelReady = false;
    return ask(spare, language, task, onLoading);
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
  /** A plain sentence on which path wrote the captions, for the result line. */
  pathNote: string;
}

/** Which path recognised the pieces: the graphics chip (WebGPU) or the processor (WebAssembly), as for the video background tools. */
function pathNote(onChip: number, onCpu: number): string {
  if (onChip === 0) return 'Wrote the captions with the processor.';
  return onCpu === 0 ? 'Wrote the captions with the graphics chip.' : 'Wrote the captions with the graphics chip, then with the processor after the chip stopped.';
}

/**
 * Transcribe the speech in `file`. `language` is a Whisper code or 'auto'.
 * `onProgress` gets a message and a fraction from 0 to 1.
 */
export async function transcribeFile(
  file: File,
  opts: { language: string; task: Request['task']; onProgress: (message: string, fraction: number) => void },
): Promise<Speech> {
  const { onProgress } = opts;
  onProgress(`Reading the sound from ${file.name}…`, 0.02);
  // A file the browser could not read from disk is read once more before anything is said about its sound.
  const samples = await retryUnreadable(
    file,
    () => speechSamples(file, (f) => onProgress(`Reading the sound from ${file.name}…`, 0.02 + 0.03 * f)),
    (message) => onProgress(message, 0.02),
  );
  const total = samples.length / RATE;
  if (total < 0.5) throw noSpeechFound('The recording is too short to hold any speech.');
  const cuts = [0, ...cutPoints(samples, RATE), samples.length];
  const segments: Segment[] = [];
  // Detected once, from the first piece, then kept for the rest of the recording.
  let spoken: string | null = opts.language === 'auto' ? null : opts.language;
  let retriedModel = false;
  // Pieces done in this run: the module's `modelReady` outlives a worker that died between runs, and its replacement starts the model from scratch.
  let recognised = 0;
  let onChip = 0;
  let onCpu = 0;
  for (let i = 1; i < cuts.length; i++) {
    const from = cuts[i - 1]!;
    const at = from / RATE;
    onProgress(`Transcribing ${file.name}: ${formatDuration(at)} of ${formatDuration(total)}`, 0.05 + 0.95 * (at / total));
    // A copy, because the samples are handed over to the worker.
    const piece = samples.slice(from, cuts[i]);
    const loading = (f: number) => {
      if (!modelReady) onProgress(`Downloading the speech model, once (${onGpu ? SPEECH_MODEL_MB.webgpu : SPEECH_MODEL_MB.q8} MB): ${Math.round(f * 100)}%`, 0.05 * f);
    };
    let found;
    try {
      found = await recognise(piece.slice(), spoken, opts.task, loading);
    } catch (err) {
      // Before any piece has been recognised, a model that would not start (a kept copy the worker dropped, or a start-up
      // that ran out of memory or killed the worker) gets one more try in a fresh worker: a download again, or the model
      // from the store. Once a piece of this run has been done, a failure is the recording's and is not retried.
      if (recognised > 0 || retriedModel || !(err instanceof Error) || !restartsOnce(err)) throw err;
      retriedModel = true;
      releaseSpeechModel();
      // A stopped worker gives its memory back a moment later.
      await new Promise((done) => setTimeout(done, 1000));
      found = await recognise(piece, spoken, opts.task, loading);
    }
    modelReady = true;
    recognised++;
    if (onGpu) onChip++;
    else onCpu++;
    spoken = found.language;
    segments.push(...found.chunks.map((s) => ({ start: s.start + at, end: s.end + at, text: s.text })));
  }
  return { segments: clean(segments), language: spoken!, duration: total, pathNote: pathNote(onChip, onCpu) };
}
