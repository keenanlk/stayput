/**
 * Turns 22,050 Hz mono audio into note events off the main thread with Basic
 * Pitch (Spotify, Apache-2.0), run through onnxruntime-web on the CPU
 * (WebAssembly). The network is tiny, so WebGPU is not used: measured on a
 * 30-second clip it is no faster, and its engine is 27 MB against 14 MB. The
 * windowing and note maths are in basic-pitch.ts. The 0.2 MB model is fetched
 * from /models/ on first use only. The worker sees decoded samples, never the
 * file or its name.
 */
import type { InferenceSession, Tensor } from 'onnxruntime-web';
import { vendorDir } from './vendor';
import { workerFailure } from './worker-error';
import { fetchResumable, wholeOrNull } from './model-fetch';
import { KEPT_FRAMES, PITCHES, WINDOW_FRAMES, WINDOW_SAMPLES, framesFor, notesFromActivations, windowAt, windowCount } from './basic-pitch';
import type { MidiNote } from './midi';

export const MODEL_URL = '/models/nmp.onnx';
const MODEL_BYTES = 230_444;

export type Request = { id: number; audio: Float32Array };
export type Reply =
  | { id: number; type: 'loading'; fraction: number }
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'done'; notes: MidiNote[] }
  | { id: number; type: 'error'; name: string; message: string };

type Ort = typeof import('onnxruntime-web');
interface Loaded { ort: Ort; session: InferenceSession }
let loaded: Promise<Loaded> | undefined;

async function fetchModel(onProgress: (f: number) => void): Promise<Uint8Array> {
  const res = await fetchResumable((i, o) => fetch(i, o), MODEL_URL, undefined, (got, total) => total && onProgress(Math.min(1, got / total)));
  if (!res.ok) throw new Error(`The note model could not be downloaded (HTTP ${res.status}). Check your connection and try again.`);
  const whole = await wholeOrNull(res);
  if (!whole) throw new Error('The note model download stopped short. Check your connection and try again.');
  const bytes = new Uint8Array(await whole.arrayBuffer());
  if (bytes.length !== MODEL_BYTES) throw new Error('The note model file is not the expected size. Reload the page and try again.');
  return bytes;
}

function load(onProgress: (f: number) => void): Promise<Loaded> {
  loaded ??= (async () => {
    const model = await fetchModel(onProgress);
    const ort = (await import('onnxruntime-web/wasm')) as unknown as Ort;
    ort.env.wasm.wasmPaths = vendorDir('ort');
    // Threads need a cross-origin-isolated page, which this site is not.
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { ort, session };
  })();
  loaded.catch(() => (loaded = undefined));
  return loaded;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, audio } = e.data;
  const post = (msg: Reply) => (self as unknown as Worker).postMessage(msg);
  try {
    const { ort, session } = await load((fraction) => post({ id, type: 'loading', fraction }));
    // The file's outputs are, in order, the contour (264 values a frame), the note activation and the onset (88 each).
    if (session.outputNames.length !== 3) throw new Error('The note model has an unexpected shape.');
    const count = windowCount(audio.length);
    const nFrames = Math.min(framesFor(audio.length), count * KEPT_FRAMES);
    const frames = new Float32Array(count * KEPT_FRAMES * PITCHES);
    const onsets = new Float32Array(count * KEPT_FRAMES * PITCHES);
    const input = session.inputNames[0]!;
    const window = new Float32Array(WINDOW_SAMPLES);
    const skip = (WINDOW_FRAMES - KEPT_FRAMES) / 2;
    post({ id, type: 'progress', done: 0, total: count });
    for (let w = 0; w < count; w++) {
      windowAt(audio, w, window);
      const result = await session.run({ [input]: new ort.Tensor('float32', window, [1, WINDOW_SAMPLES, 1]) });
      const pick = async (name: string) => (await (result[name] as Tensor).getData()) as Float32Array;
      const [note, onset] = [await pick(session.outputNames[1]!), await pick(session.outputNames[2]!)];
      frames.set(note.subarray(skip * PITCHES, (skip + KEPT_FRAMES) * PITCHES), w * KEPT_FRAMES * PITCHES);
      onsets.set(onset.subarray(skip * PITCHES, (skip + KEPT_FRAMES) * PITCHES), w * KEPT_FRAMES * PITCHES);
      for (const name of session.outputNames) (result[name] as Tensor).dispose?.();
      post({ id, type: 'progress', done: w + 1, total: count });
    }
    post({ id, type: 'done', notes: notesFromActivations(frames, onsets, nFrames) });
  } catch (err) {
    post({ id, type: 'error', ...workerFailure(err) });
  }
};
