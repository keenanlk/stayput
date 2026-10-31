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
import { decoderOrder, soundOf, type SoundKind } from './audio-codecs';
import { amrPcm, bareSound, ensureAc3, hasAudioDecoder, refusalFor } from './odd-audio';

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
 * `rate` is the sample rate the sound comes back at (48 kHz unless the caller needs another); with `whole` off the whole-file
 * decoder is never tried (its sound would come back at 48 kHz), and a file the demuxer cannot place is null.
 */
export async function decodePcmSliced(file: Blob, rate = SAMPLE_RATE, whole = true): Promise<Float32Array[] | null> {
  await refuseSoundlessContainer(file);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let sound: SoundKind | null = null;
  let cause: unknown;
  try {
    const track = await input.getPrimaryAudioTrack().catch((e) => (unlessFatal(e), null));
    if (track) {
      const { demuxedSound } = await import('./demux-audio');
      const wrapped = await demuxedSound(input, rate, false).catch((e) => (unlessFatal(e), null));
      if (wrapped) return wrapped;
    }
    sound = soundOf(track) ?? (await bareSound(file));
    const found = await decodedByPageDecoders(file, track, sound, rate).catch((e) => (unlessFatal(e), (cause = e), null));
    if (found) return found;
  } finally {
    input.dispose?.();
  }
  if (!whole || file.size > WHOLE_FILE_LIMIT) return null;
  const pcm = await decodePcm(file).catch((e) => {
    unlessFatal(e);
    throw refusalFor(sound, cause) ?? e;
  });
  // The browser and the demuxer both came up empty: a sound in a named format nothing here reads is said so, not called "no sound".
  if (!pcm || !pcm[0]?.length) throw refusalFor(sound, cause) ?? new NamedError('NoSoundTrack', 'No sound could be read from this file.');
  return pcm;
}

/**
 * The sound read by the page's own decoders after the browser's refused it, in the order decoderOrder gives: WebCodecs, the
 * Dolby decoder for AC-3 and E-AC-3, the libav build for AMR. Null when none applied or none could read it.
 */
async function decodedByPageDecoders(file: Blob, track: InputAudioTrack | null, sound: SoundKind | null, rate: number): Promise<Float32Array[] | null> {
  if (!sound) return null;
  for (const step of decoderOrder(sound, { audioDecoder: hasAudioDecoder() })) {
    if (step === 'amr') return amrPcm(file, track, sound, rate);
    if (step === 'webcodecs' || step === 'ac3') {
      if (step === 'ac3') await ensureAc3();
      const decoded = track ? await decodedByCodecs(track, rate) : null;
      if (decoded) return decoded;
    }
  }
  return null;
}

/**
 * The file's sound at `rate` (one or two channels) read only by the page's decoders, for a sound the browser's own decoder refused
 * (Opus or FLAC in MP4, ALAC, PCM in a MOV, AC-3, AMR). Null when the file holds no sound this can name; throws UnsupportedAudioCodec
 * for a named format nothing here reads.
 */
export async function decodePcmByPageDecoders(file: Blob, rate: number): Promise<Float32Array[] | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack().catch((e) => (unlessFatal(e), null));
    const sound = soundOf(track) ?? (await bareSound(file));
    let cause: unknown;
    const found = await decodedByPageDecoders(file, track, sound, rate).catch((e) => (unlessFatal(e), (cause = e), null));
    if (found) return found;
    const refusal = refusalFor(sound, cause);
    if (refusal) throw refusal;
    return null;
  } finally {
    input.dispose?.();
  }
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
