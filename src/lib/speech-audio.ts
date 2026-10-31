/**
 * The sound of a video as 16 kHz mono, for the speech model, without reading
 * the whole video into memory. Mediabunny finds the sound track and hands over
 * its packets a few minutes at a time; each stretch is wrapped in a small MP4
 * (the packets are copied, not re-encoded) and decoded by the browser. Safari
 * on iPhone cannot decode a QuickTime .mov by itself, and decoding a whole
 * phone video at once can run the tab out of memory, so a file is never given
 * to the decoder as it is.
 *
 * When the browser's own decoder refuses the sound, the page's decoders get a
 * turn, in the order decoderOrder gives (WebCodecs through Mediabunny; the Dolby
 * decoder for AC-3; the libav build for AMR), and a sound none can read ends as
 * UnsupportedSound, naming the format (Opus in Safari before 26, say), not as a
 * generic failure.
 */
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input, type InputAudioTrack } from 'mediabunny';
import { demuxedSound, grown, NO_SOUND, plannedSamples } from './demux-audio';
import { decodeAudio, channelsOf } from './audio';
import { decoderOrder, soundFormatName, soundOf, undecodableText, type SoundKind } from './audio-codecs';
import { amrPcm, bareSound, ensureAc3, hasAudioDecoder, refusalFor } from './odd-audio';
import { isNotReadable, notReadable } from './read-failure';
import { isPhoneBrowser } from './phone-limit';
import { audioDecodeError, unsupportedSound, isRecordingTooLong, looksLikeMemory, outOfMemoryError, recordingTooLongError, speechSecondsBudget, SpeechError } from './speech-errors';

export const SPEECH_RATE = 16000;

/** The file's sound as mono samples at 16 kHz. Audio-only files go to the browser whole, as before. */
export async function speechSamples(file: File, onProgress?: (fraction: number) => void): Promise<Float32Array> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    // A file the browser cannot read is neither a video without sound nor a sound it cannot decode: it goes up to be read again.
    const hasVideo = !!(await input.getPrimaryVideoTrack().catch(unlessUnreadable));
    // The first thing that went wrong on the way, kept so a failed run is named for it (a class name, never the message).
    let cause: unknown;
    const track = await input.getPrimaryAudioTrack().catch((e) => (unlessUnreadable(e), (cause ??= e), null));
    if (hasVideo && !track) {
      // A video with no sound track is its own kind of failure to the stats, unless the reader failed with an error of its own.
      const none = audioDecodeError(NO_SOUND, cause);
      if (cause === undefined) none.name = 'NoSoundTrack';
      throw none;
    }
    // A recording over the device's memory budget is refused now, not after the model is fetched and the tab is gone.
    if (track) {
      const seconds = await input.computeDuration().catch(() => NaN);
      const budget = speechSecondsBudget((navigator as { deviceMemory?: number }).deviceMemory, isPhoneBrowser());
      // A container can claim any duration (a recording with an absurd one is still read), so a claim the file's size cannot back is no reason to refuse. Only that direction is guarded: a short claim over a far larger file is not refused here (the decoder finds the real length).
      const believable = Number.isFinite(seconds) && seconds > 0 && file.size / seconds >= 500;
      if (believable && seconds > budget) throw recordingTooLongError(seconds, budget);
    }
    const sound = soundOf(track) ?? (await bareSound(file));
    // A video's sound is copied out and decoded a stretch at a time, and a stretch the browser refuses is not retried on the whole file, which is what that path exists to avoid.
    let failed = false;
    for (const step of decoderOrder(sound ?? { codec: null }, { audioDecoder: hasAudioDecoder(), stretchFirst: hasVideo })) {
      try {
        if (step === 'wrap') {
          if (!hasVideo) continue;
          const mono = await demuxedSound(input, SPEECH_RATE, true, onProgress);
          if (mono) return mono[0]!;
        } else if (step === 'browser') {
          if (!failed) return await wholeFile(file);
        } else if (step === 'amr') {
          return (await amrPcm(file, track, sound!, SPEECH_RATE))[0]!;
        } else if (track) {
          if (step === 'ac3') await ensureAc3();
          const samples = await decodedByCodecs(track, SPEECH_RATE, onProgress);
          if (samples) return samples;
        }
      } catch (e) {
        if (looksLikeMemory(e) || isNotReadable(e) || (step === 'wrap' && e instanceof SpeechError && e.message === NO_SOUND)) throw e;
        cause ??= e;
        if (step === 'wrap') failed = true;
      }
    }
    const message = undecodableMessage(sound, cause);
    // A named format nothing here reads is its own kind of failure; a damaged AAC or MP3 file, or one that says nothing, stays a decode failure.
    if (refusalFor(sound) && !isUnreadable(cause)) throw unsupportedSound(message, cause);
    throw audioDecodeError(message, cause);
  } catch (e) {
    throw asSpeechError(e);
  } finally {
    input.dispose?.();
  }
}

/** Rethrows a read failure; any other error is the caller's to handle (null for a missing track). */
function unlessUnreadable(e: unknown): null {
  if (isNotReadable(e)) throw e;
  return null;
}

/** Anything a decode throws, as one of the page's own errors. */
function asSpeechError(e: unknown): Error {
  if (isNotReadable(e)) return notReadable(e);
  if (isRecordingTooLong(e)) return e as Error;
  if (e instanceof SpeechError && ['AudioDecodeError', 'OutOfMemoryError', 'UnsupportedSound'].includes(e.kind)) return e;
  if (e instanceof Error && ['AudioDecodeError', 'OutOfMemoryError', 'UnsupportedSound'].includes(e.name)) return e;
  return looksLikeMemory(e) ? outOfMemoryError() : audioDecodeError(undefined, e);
}

async function wholeFile(file: File): Promise<Float32Array> {
  const [samples] = channelsOf(await decodeAudio(file, SPEECH_RATE, false), true) as [Float32Array];
  return samples;
}

/**
 * Decode with the page's decoder (WebCodecs, through Mediabunny), buffer by buffer, mixing to mono and averaging
 * down to `rate` as each arrives. Null when this browser has no decoder for the track.
 */
async function decodedByCodecs(track: InputAudioTrack, rate: number, onProgress?: (fraction: number) => void): Promise<Float32Array | null> {
  if (!track.codec || !(await track.canDecode())) return null;
  const seconds = await track.computeDuration();
  // The container's duration only sizes the first guess: a wrong one must not decide how much memory is asked for.
  let out = new Float32Array(plannedSamples(seconds, rate));
  let end = 0;
  for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
    const step = buffer.sampleRate / rate;
    const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const at = Math.max(0, Math.round(timestamp * rate));
    const n = Math.floor(buffer.length / step);
    out = grown(out, at + n);
    for (let j = 0; j < n; j++) {
      const from = Math.floor(j * step);
      const to = Math.max(from + 1, Math.min(buffer.length, Math.floor((j + 1) * step)));
      let sum = 0;
      for (const ch of chans) for (let i = from; i < to; i++) sum += ch[i]!;
      out[at + j] = sum / (chans.length * (to - from));
    }
    end = Math.max(end, at + n);
    onProgress?.(Math.min(0.99, timestamp / Math.max(1, seconds)));
  }
  return end > 0 ? out.subarray(0, end) : null;
}

const isUnreadable = (cause: unknown) => cause instanceof Error && ['NotReadableError', 'NotFoundError'].includes(cause.name);

/** The sentence for a sound this browser could not read, naming its format where that is known. */
function undecodableMessage(sound: SoundKind | null, cause?: unknown): string {
  // A file the browser could not even read (cloud storage that is not on the device, say) is not a sound format problem.
  if (isUnreadable(cause)) return 'This file could not be read. If it is in cloud storage (Google Drive or Photos, say), save a copy on this device first and add that.';
  return undecodableText(soundFormatName(sound));
}
