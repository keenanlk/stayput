import { formatDuration } from './audio';
import { SPEECH_RATE, speechSamples } from './speech-audio';
import { clean, cutPoints, type Segment } from './captions';
import { fromWorker, noSpeechFound, workerCrashError } from './speech-errors';
import type { Reply, Request } from './transcribe.worker';

/**
 * Speech in a file to timed text, for Transcribe and Add subtitles to video.
 * The sound is decoded in the tab at 16 kHz mono, cut at pauses into pieces
 * of up to 28 seconds, and each piece goes to Whisper in a worker
 * (transcribe.worker.ts). Nothing is uploaded.
 */

const RATE = SPEECH_RATE;

let worker: Worker | undefined;
let nextId = 0;
function recognise(audio: Float32Array, language: string | null, task: Request['task'], onLoading: (f: number) => void): Promise<{ chunks: Segment[]; language: string }> {
  let w: Worker;
  try {
    worker ??= new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });
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
      else reject(fromWorker(msg.name, msg.message));
    };
    // The worker script failed to load or the browser killed it (memory, mostly): the page's own text, never the event's.
    const onError = () => {
      done();
      worker = undefined;
      w.terminate();
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

let modelReady = false;

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
  for (let i = 1; i < cuts.length; i++) {
    const from = cuts[i - 1]!;
    const at = from / RATE;
    onProgress(`Transcribing ${file.name}: ${formatDuration(at)} of ${formatDuration(total)}`, 0.05 + 0.95 * (at / total));
    // A copy, because the samples are handed over to the worker.
    const piece = samples.slice(from, cuts[i]);
    const found = await recognise(piece, spoken, opts.task, (f) => {
      if (!modelReady) onProgress(`Downloading the speech model, once (76 MB): ${Math.round(f * 100)}%`, 0.05 * f);
    });
    modelReady = true;
    spoken = found.language;
    segments.push(...found.chunks.map((s) => ({ start: s.start + at, end: s.end + at, text: s.text })));
  }
  return { segments: clean(segments), language: spoken!, duration: total };
}
