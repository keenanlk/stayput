/**
 * Sound as plain numbers, for the video tools that build a new sound track
 * (speed, merge, add audio): decode a file's sound with the browser's own
 * decoders, and feed PCM into a Mediabunny audio source in step with the
 * pictures.
 */
import { ALL_FORMATS, AudioBufferSink, AudioSample, BlobSource, Input, type AudioSampleSource, type InputAudioTrack } from 'mediabunny';
import { foldToStereo } from './fold-channels';
import { NamedError } from './input-error';
import { isNotReadable, retryUnreadable } from './read-failure';
import { decodeWithin, refuseSoundlessContainer } from './decode-guard';

export const SAMPLE_RATE = 48_000;

/** The file's sound as one or two channels at 48 kHz, or null when it has none the browser can read. */
export async function decodePcm(file: Blob): Promise<Float32Array[] | null> {
  const ctx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  try {
    await refuseSoundlessContainer(file);
    const buffer = await decodeWithin(ctx, () => retryUnreadable(file, () => file.arrayBuffer()));
    return Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i));
  } catch (e) {
    // A file the browser cannot read is not one it cannot decode: say so, as the demuxer would only fail the same way.
    if (isNotReadable(e) || (e instanceof Error && e.name === 'NoSoundTrack')) throw e;
    // Safari refuses a QuickTime .mov whole; its sound track is read through the demuxer instead.
    const { demuxedFileSound } = await import('./demux-audio');
    return demuxedFileSound(file, SAMPLE_RATE, false).catch((err) => {
      if (isNotReadable(err)) throw err;
      return null;
    });
  }
}

/** The largest file handed to the browser's decoder whole once the demuxer could not place its sound: it reads the file into memory, and a phone gives a tab far less than a desktop. */
const WHOLE_FILE_LIMIT = 150 * 1024 * 1024;
const MEMORY_TEXT = /out of memory|bad_alloc|allocation failed|array buffer allocation|invalid (typed )?array length/i;

/** The error for a sound too big for this device's memory. Its name is what a failed run records. */
export const soundTooBig = (cause?: unknown) => {
  const out = new NamedError('OutOfMemoryError', 'This device ran out of memory reading the sound of this video. Trim the video to a shorter length first, or use a computer.');
  out.cause = cause;
  return out;
};

/** A read failure and a failed allocation are the page's to report; anything else just means this way of decoding did not work. */
function unlessFatal(e: unknown): void {
  if (isNotReadable(e)) throw e;
  if (e instanceof RangeError || (e instanceof Error && MEMORY_TEXT.test(e.message))) throw soundTooBig(e);
}

/** Decodes with the page's WebCodecs decoder, buffer by buffer, folding surround to stereo and resampling to `rate` as each arrives. Null when this browser has no decoder for the track or it holds no sound. */
async function decodedByCodecs(track: InputAudioTrack, rate: number): Promise<Float32Array[] | null> {
  if (!track.codec || !(await track.canDecode())) return null;
  const { grown, plannedSamples } = await import('./demux-audio');
  const seconds = await track.computeDuration();
  let out: Float32Array<ArrayBuffer>[] | null = null;
  let end = 0;
  for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
    const chans = foldToStereo(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)));
    const step = buffer.sampleRate / rate;
    const at = Math.max(0, Math.round(timestamp * rate));
    const n = Math.floor(buffer.length / step);
    out = out ? out.map((ch) => grown(ch, at + n)) : chans.map(() => new Float32Array(plannedSamples(seconds, rate)));
    for (const [c, ch] of chans.entries()) {
      const dst = out[Math.min(c, out.length - 1)]!;
      for (let j = 0; j < n; j++) {
        const pos = j * step;
        const i = Math.floor(pos);
        const next = ch[Math.min(buffer.length - 1, i + 1)]!;
        dst[at + j] = ch[i]! + (next - ch[i]!) * (pos - i);
      }
    }
    end = Math.max(end, at + n);
  }
  return out && end > 0 ? out.map((ch) => ch.subarray(0, end)) : null;
}

/**
 * Like `decodePcm`, but the file is read in slices through the demuxer, never whole: a phone video of several hundred
 * MB read at once fails the allocation, which Chrome on Android reports as NotReadableError (and a re-read fails the
 * same way). AAC and MP3 are decoded in stretches; other codecs through the page's decoder. Only a file the demuxer
 * cannot place is handed to `decodePcm`, and only up to a size a phone can hold. A failed allocation is OutOfMemoryError.
 */
export async function decodePcmSliced(file: Blob): Promise<Float32Array[] | null> {
  await refuseSoundlessContainer(file);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack().catch((e) => (unlessFatal(e), null));
    if (track) {
      const { demuxedSound } = await import('./demux-audio');
      const wrapped = await demuxedSound(input, SAMPLE_RATE, false).catch((e) => (unlessFatal(e), null));
      if (wrapped) return wrapped;
      const decoded = await decodedByCodecs(track, SAMPLE_RATE).catch((e) => (unlessFatal(e), null));
      if (decoded) return decoded;
    }
  } finally {
    input.dispose?.();
  }
  if (file.size > WHOLE_FILE_LIMIT) return null;
  return decodePcm(file).catch((e) => {
    unlessFatal(e);
    throw e;
  });
}

/** Two channels, whatever came in (mono is copied to both sides). */
export function stereo(chans: Float32Array[]): Float32Array[] {
  return chans.length >= 2 ? chans.slice(0, 2) : [chans[0]!, chans[0]!];
}

/** Hands PCM to an audio source in 4096-sample pieces, up to a given time. */
export function pcmFeeder(source: AudioSampleSource | null, chans: Float32Array[] | null, rate = SAMPLE_RATE) {
  let at = 0;
  const len = chans?.[0]?.length ?? 0;
  return {
    length: len,
    async until(seconds: number) {
      if (!source || !chans) return;
      const end = Math.min(len, Math.round(seconds * rate));
      while (at < end) {
        const n = Math.min(4096, end - at);
        const data = new Float32Array(n * chans.length);
        chans.forEach((ch, c) => data.set(ch.subarray(at, at + n), c * n));
        const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: chans.length, sampleRate: rate, timestamp: at / rate });
        await source.add(sample);
        sample.close();
        at += n;
      }
    },
  };
}
