/**
 * Background noise removal with RNNoise (BSD-3-Clause, Xiph.Org and Mozilla),
 * a small recurrent network trained to keep speech and drop steady noise:
 * hiss, hum, fans, air conditioning, traffic, keyboard clatter. The WebAssembly
 * build is @shiguredo/rnnoise-wasm (Apache-2.0), served from /vendor/ and
 * loaded only when a file is processed. The model is built into the module,
 * so nothing is fetched from anywhere else.
 *
 * RNNoise works on 48 kHz audio in 10 ms frames of 480 samples scaled like
 * 16-bit PCM, and its output lags the input by one frame; that lag is removed
 * here so the cleaned sound stays in sync with a video's picture.
 */
import { vendorEntry } from './vendor';

export const DENOISE_RATE = 48_000;

interface DenoiseState {
  processFrame(frame: Float32Array): number;
  destroy(): void;
}
interface Rnnoise {
  readonly frameSize: number;
  createDenoiseState(): DenoiseState;
}

let loading: Promise<Rnnoise> | undefined;
export function loadRnnoise(): Promise<Rnnoise> {
  loading ??= (import(/* @vite-ignore */ vendorEntry('rnnoise')) as Promise<{ Rnnoise: { load(): Promise<Rnnoise> } }>)
    .then((m) => m.Rnnoise.load())
    .catch((err) => {
      loading = undefined;
      const out = new Error('The noise remover could not load. Check your connection and try again.');
      out.name = 'NoiseModelLoadError';
      out.cause = err;
      throw out;
    });
  return loading;
}

/** Let the browser paint and handle input. A message, unlike a timer, is not slowed down in a background tab. */
const yieldToPage = () =>
  new Promise<void>((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => resolve();
    port2.postMessage(0);
  });

export interface DenoiseResult {
  chans: Float32Array[];
  /** Share of 10 ms frames RNNoise judged to hold a voice, 0..1. */
  voice: number;
}

/**
 * Remove noise from 48 kHz channels. `strength` 1 keeps only RNNoise's output;
 * lower values mix some of the original back in, which sounds more natural on
 * music or when the noise is part of the scene.
 */
export async function denoise(rnnoise: Rnnoise, chans: Float32Array[], strength = 1, onProgress?: (f: number) => void): Promise<DenoiseResult> {
  const N = rnnoise.frameSize;
  const len = chans[0]?.length ?? 0;
  // One extra frame at the end flushes the lag out of the network.
  const frames = Math.ceil(len / N) + 1;
  const frame = new Float32Array(N);
  let voiced = 0;
  const out: Float32Array[] = [];
  for (const [c, ch] of chans.entries()) {
    const state = rnnoise.createDenoiseState();
    const res = new Float32Array(len);
    try {
      for (let f = 0; f < frames; f++) {
        const at = f * N;
        frame.fill(0);
        for (let i = 0; i < N && at + i < len; i++) frame[i] = ch[at + i]! * 32768;
        const vad = state.processFrame(frame);
        if (c === 0 && at < len && vad > 0.5) voiced++;
        // Output frame f holds input frame f - 1.
        const dst = at - N;
        for (let i = 0; i < N; i++) {
          const j = dst + i;
          if (j < 0 || j >= len) continue;
          const clean = frame[i]! / 32768;
          res[j] = strength >= 1 ? clean : clean * strength + ch[j]! * (1 - strength);
        }
        // Hand the page back to the browser every couple of seconds of sound, so progress shows and the tab stays responsive.
        if (f % 200 === 199) {
          onProgress?.((c + f / frames) / chans.length);
          await yieldToPage();
        }
      }
    } finally {
      state.destroy();
    }
    out.push(res);
  }
  onProgress?.(1);
  return { chans: out, voice: frames > 1 ? voiced / (frames - 1) : 0 };
}

/** Resample channels with the browser's own resampler. */
export async function resample(chans: Float32Array[], from: number, to: number): Promise<Float32Array[]> {
  if (from === to || !chans[0]?.length) return chans;
  const length = Math.max(1, Math.round((chans[0].length * to) / from));
  const ctx = new OfflineAudioContext(chans.length, length, to);
  const buffer = ctx.createBuffer(chans.length, chans[0].length, from);
  chans.forEach((ch, i) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  return Array.from({ length: chans.length }, (_, i) => rendered.getChannelData(i));
}

/**
 * Give an error from one step of cleaning a file a name that says which step
 * (the name is all a failed run records). Errors that already have a name of
 * their own pass through; a bare Error takes the step's name, and an error
 * that reads as running out of memory says so.
 */
export function inStage(stage: 'NoiseDecodeError' | 'NoiseRemoveError' | 'NoiseWriteError', e: unknown): Error {
  if (e instanceof Error && e.name !== 'Error') return e;
  const text = e instanceof Error ? e.message : String(e);
  const memory = /memory|allocation|bad_alloc/i.test(text) || (e instanceof RangeError && /array|buffer|length/i.test(text));
  const out = new Error(
    memory
      ? 'This device ran out of memory cleaning this video. Trim the video to a shorter length first, or use a computer.'
      : stage === 'NoiseDecodeError'
        ? 'The sound of this file could not be read. Try a shorter clip or another file.'
        : stage === 'NoiseRemoveError'
          ? 'The noise could not be removed from this sound. Reload the page and try again, or try a shorter clip.'
          : 'The cleaned video could not be written. Reload the page and try again, or try a shorter clip.',
  );
  out.name = memory ? 'OutOfMemoryError' : stage;
  out.cause = e;
  return out;
}
