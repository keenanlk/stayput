/**
 * Writes one part of a split as MP3 or WAV from pieces of sound as they arrive, so the part is never held whole as numbers: a 90-minute
 * part is 950 MB of 16-bit samples as a WAV, and 1.4 GB as numbers. Only audio-splitter.ts imports this (the shared writers in audio.ts take
 * the whole part at once and are left as they are). Nothing leaves the tab.
 */
import { createEncoder } from 'wasm-media-encoders';
import { vendorDir } from './vendor';
import { AUDIO_COPY, ranOutOfMemory, stageError } from './bare-error';
import { NamedError } from './input-error';
import type { Bitrate } from './audio';

type Mp3Encoder = Awaited<ReturnType<typeof createEncoder<'audio/mpeg'>>>;

export const MP3_LOAD_COPY = 'The MP3 writer could not be loaded, which usually means the connection dropped. Check your connection and try again, or choose WAV under Save as, which needs nothing to be downloaded.';
export const WAV_TOO_LONG_COPY = 'This part is too long to save as a WAV (4 GB is the most a WAV can hold). Split into shorter parts, or save as MP3.';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Gives the page a moment to repaint, unless it is hidden: a hidden page paints nothing, and its timers run about once a second. */
const yieldToUi = () => (typeof document !== 'undefined' && document.hidden ? Promise.resolve() : sleep(0));

/** A failure of the encoder's own (a WebAssembly trap, a failed allocation) with the step's name and plain words; the browser's wording is kept as the cause. */
function encodeFailed(step: string, e: unknown, format: string): Error {
  if (ranOutOfMemory(e)) return stageError(step, e, { memory: AUDIO_COPY.memorySplitter });
  return new NamedError(step, AUDIO_COPY.save(format), { cause: e });
}

/** An error the sound source already named (it could not be read) goes through; anything else here came from the encoder. */
const ours = (e: unknown) => e instanceof Error && !['RuntimeError', 'Error', 'RangeError', 'TypeError', 'CompileError', 'LinkError', 'DOMException'].includes(e.name);

/** The LAME encoder, fetched with up to three tries a moment apart (a flaky connection drops a request now and then). Never falls back to WAV on its own. */
export async function loadMp3Encoder(pauses = [500, 1500]): Promise<Mp3Encoder> {
  let last: unknown;
  for (let attempt = 0; attempt <= pauses.length; attempt++) {
    try {
      return await createEncoder('audio/mpeg', `${vendorDir('lame')}mp3.wasm`);
    } catch (e) {
      last = e;
      // Retrying cannot make memory appear.
      if (ranOutOfMemory(e) || attempt === pauses.length) break;
      await sleep(pauses[attempt]!);
    }
  }
  if (ranOutOfMemory(last)) throw stageError('Mp3EncoderLoadFailed', last, { memory: AUDIO_COPY.memorySplitter });
  throw new NamedError('Mp3EncoderLoadFailed', MP3_LOAD_COPY, { cause: last });
}

/** Constant-bitrate MP3 from pieces of sound. `total` is the part's length in samples, for the progress figure. */
export async function encodeMp3Chunks(chunks: AsyncIterable<Float32Array[]>, channels: 1 | 2, rate: number, bitrate: Bitrate, total: number, onProgress?: (f: number) => void): Promise<Blob> {
  const encoder = await loadMp3Encoder();
  encoder.configure({ channels, sampleRate: rate, bitrate });
  const parts: BlobPart[] = [];
  // About three seconds of audio per call, as the shared writer does.
  const step = 1152 * 115;
  let done = 0;
  try {
    for await (const piece of chunks) {
      const length = piece[0]!.length;
      for (let i = 0; i < length; i += step) {
        const out = encoder.encode(piece.map((c) => c.subarray(i, Math.min(length, i + step))));
        // The encoder reuses its output buffer, so copy before the next call.
        parts.push(out.slice());
      }
      done += length;
      onProgress?.(Math.min(1, done / Math.max(1, total)));
      await yieldToUi();
    }
    parts.push(encoder.finalize().slice());
  } catch (e) {
    // The encoder's own failures are named here; an error already named (the sound could not be read) goes through.
    throw ours(e) ? e : encodeFailed('Mp3EncodeFailed', e, 'MP3');
  }
  return new Blob(parts, { type: 'audio/mpeg' });
}

/** 16-bit WAV from pieces of sound. `total` is the part's length in samples; the pieces must add up to it. */
export async function encodeWavChunks(chunks: AsyncIterable<Float32Array[]>, channels: 1 | 2, rate: number, total: number, onProgress?: (f: number) => void): Promise<Blob> {
  const dataBytes = total * channels * 2;
  if (dataBytes > 0xffffffff - 36) throw new NamedError('PartTooLong', WAV_TOO_LONG_COPY);
  const head = new ArrayBuffer(44);
  const v = new DataView(head);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  tag(36, 'data');
  v.setUint32(40, dataBytes, true);
  const parts: BlobPart[] = [head];
  let done = 0;
  try {
    for await (const piece of chunks) {
      const n = piece[0]!.length;
      const pcm = new Int16Array(n * channels);
      for (let c = 0; c < channels; c++) {
        const src = piece[c]!;
        for (let i = 0; i < n; i++) {
          const s = Math.max(-1, Math.min(1, src[i]!));
          pcm[i * channels + c] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
      }
      parts.push(pcm);
      done += n;
      onProgress?.(Math.min(1, done / Math.max(1, total)));
      await yieldToUi();
    }
    return new Blob(parts, { type: 'audio/wav' });
  } catch (e) {
    throw ours(e) ? e : encodeFailed('WavEncodeFailed', e, 'WAV');
  }
}
