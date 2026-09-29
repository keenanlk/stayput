import { channelsOf, decodeAudio, formatDuration } from './audio';
import { clean, cutPoints, type Segment } from './captions';
import type { Reply, Request } from './transcribe.worker';

/**
 * Speech in a file to timed text, for Transcribe and Add subtitles to video.
 * The sound is decoded in the tab at 16 kHz mono, cut at pauses into pieces
 * of up to 28 seconds, and each piece goes to Whisper in a worker
 * (transcribe.worker.ts). Nothing is uploaded.
 */

const RATE = 16000;

let worker: Worker | undefined;
let nextId = 0;
function recognise(audio: Float32Array, language: string | null, task: Request['task'], onLoading: (f: number) => void): Promise<{ chunks: Segment[]; language: string }> {
  worker ??= new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<Reply>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'loading') return onLoading(msg.fraction);
      done();
      if (msg.type === 'result') resolve({ chunks: msg.chunks, language: msg.language });
      else reject(new Error(msg.message));
    };
    const onError = (e: ErrorEvent) => {
      done();
      worker = undefined;
      w.terminate();
      reject(new Error(e.message || 'The speech model stopped unexpectedly.'));
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
  const [samples] = channelsOf(await decodeAudio(file, RATE), true);
  const total = samples!.length / RATE;
  if (total < 0.5) throw new Error('The recording is too short to hold any speech.');
  const cuts = [0, ...cutPoints(samples!, RATE), samples!.length];
  const segments: Segment[] = [];
  // Detected once, from the first piece, then kept for the rest of the recording.
  let spoken: string | null = opts.language === 'auto' ? null : opts.language;
  for (let i = 1; i < cuts.length; i++) {
    const from = cuts[i - 1]!;
    const at = from / RATE;
    onProgress(`Transcribing ${file.name}: ${formatDuration(at)} of ${formatDuration(total)}`, 0.05 + 0.95 * (at / total));
    // A copy, because the samples are handed over to the worker.
    const piece = samples!.slice(from, cuts[i]);
    const found = await recognise(piece, spoken, opts.task, (f) => {
      if (!modelReady) onProgress(`Downloading the speech model, once (76 MB): ${Math.round(f * 100)}%`, 0.05 * f);
    });
    modelReady = true;
    spoken = found.language;
    segments.push(...found.chunks.map((s) => ({ start: s.start + at, end: s.end + at, text: s.text })));
  }
  return { segments: clean(segments), language: spoken!, duration: total };
}
