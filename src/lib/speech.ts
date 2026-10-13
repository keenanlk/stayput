import { formatDuration } from './audio';
import { SPEECH_RATE, speechSamples } from './speech-audio';
import { clean, cutPoints, type Segment } from './captions';
import { fromWorker, noSpeechFound, workerCrashError } from './speech-errors';
import { SPEECH_MODEL_MB } from '../data/speech-size';
import { rememberWebgpuFailure, wantsWebgpu } from './speech-path';
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
    w.postMessage({ id, audio, language, task } satisfies Request, [audio.buffer]);
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
  const samples = await speechSamples(file, (f) => onProgress(`Reading the sound from ${file.name}…`, 0.02 + 0.03 * f));
  const total = samples.length / RATE;
  if (total < 0.5) throw noSpeechFound('The recording is too short to hold any speech.');
  const cuts = [0, ...cutPoints(samples, RATE), samples.length];
  const segments: Segment[] = [];
  // Detected once, from the first piece, then kept for the rest of the recording.
  let spoken: string | null = opts.language === 'auto' ? null : opts.language;
  let retriedModel = false;
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
      // A kept model that would not start was dropped by the worker: a fresh worker downloads it again, once.
      if (modelReady || retriedModel || !(err instanceof Error) || err.name !== 'ModelLoadError') throw err;
      retriedModel = true;
      releaseSpeechModel();
      found = await recognise(piece, spoken, opts.task, loading);
    }
    modelReady = true;
    if (onGpu) onChip++;
    else onCpu++;
    spoken = found.language;
    segments.push(...found.chunks.map((s) => ({ start: s.start + at, end: s.end + at, text: s.text })));
  }
  return { segments: clean(segments), language: spoken!, duration: total, pathNote: pathNote(onChip, onCpu) };
}
