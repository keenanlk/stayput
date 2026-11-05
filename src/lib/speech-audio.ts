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
import { demuxedStretches, NO_SOUND, placedAt, unparsedSeconds } from './demux-audio';
import { decodeAudio, channelsOf } from './audio';
import { decoderOrder, soundFormatName, soundOf, undecodableText, type SoundKind } from './audio-codecs';
import { amrPcm, bareSound, ensureAc3, hasAudioDecoder, refusalFor } from './odd-audio';
import { isNotReadable, notReadable } from './read-failure';
import { isPhoneBrowser } from './phone-limit';
import { audioDamaged, audioDecodeError, notAnAudioFile, unsupportedSound, isRecordingTooLong, looksLikeMemory, outOfMemoryError, recordingTooLongError, speechSecondsBudget, SpeechError } from './speech-errors';

export const SPEECH_RATE = 16000;

/** Recordings longer than this (seconds) are read a stretch at a time even when the file is only sound; shorter ones are decoded whole, as they always were. */
const STREAM_ABOVE = 600;

/** An opened recording: what it holds, and its sound handed out a stretch at a time so only one piece is in memory at once. */
export interface SpeechSound {
  /** The container's own length in seconds, NaN when it says none (only a guide: the real length is what the sound turns out to be). */
  seconds: number;
  /** The sound as mono 16 kHz chunks, in order. A read that fails before any sound arrived tries the next decoder; one that fails later throws. */
  chunks(onProgress?: (fraction: number) => void, onLost?: (seconds: number) => void): AsyncGenerator<Float32Array>;
  dispose(): void;
}

/**
 * Opens the file's sound for the speech model. A recording this device cannot hold is refused here, before the model is
 * fetched. Memory depends on the size of a piece, not of the recording: the sound is decoded and resampled a stretch at a time
 * (by the browser from a copied-out wrapper, or by the page's own decoder), never as one array, wherever a decoder allows it.
 */
export async function openSpeech(file: File): Promise<SpeechSound> {
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
    const sound = soundOf(track) ?? (await bareSound(file));
    const seconds = track ? await input.computeDuration().catch(() => NaN) : NaN;
    // A container can claim any duration (a recording with an absurd one is still read), so a claim the file's size cannot back is no reason to refuse. Only that direction is guarded: a short claim over a far larger file is not refused here (the decoder finds the real length).
    const believable = Number.isFinite(seconds) && seconds > 0 && file.size / seconds >= 500;
    const budget = speechSecondsBudget((navigator as { deviceMemory?: number }).deviceMemory, isPhoneBrowser());
    // Only a decode that has to hold the whole recording is limited by the device's memory: the browser's own whole-file decode.
    const needsWhole = () => {
      if (believable && seconds > budget) throw recordingTooLongError(seconds, budget);
    };
    const wrappable = !!track && (track.codec === 'aac' || track.codec === 'mp3');
    const streams = wrappable || (!!track && !!track.codec && (await track.canDecode().catch(() => false)));
    if (!streams) needsWhole();
    // Bytes of an MP3 that did not parse are dropped by the reader without a trace in its timestamps: measured here, from the file, before the model is fetched.
    const unparsed = track && !hasVideo ? await unparsedSeconds(track, file).catch(() => 0) : 0;
    // Half or more of the recording gone: what is heard is not a transcript of it.
    if (unparsed > 0 && unparsed >= seconds) throw audioDamaged(unparsed);
    const long = believable && seconds > STREAM_ABOVE;
    return {
      seconds: believable ? seconds : NaN,
      dispose: () => input.dispose?.(),
      async *chunks(onProgress, onLost) {
        // What the reader dropped, plus what a stretch the browser refused adds to it.
        const report = (more: number) => onLost?.(unparsed + more);
        if (unparsed > 0) report(0);
        try {
          yield* decode(onProgress, report);
        } catch (e) {
          throw asSpeechError(e);
        }
      },
    };
    async function* decode(onProgress?: (fraction: number) => void, onLost?: (seconds: number) => void): AsyncGenerator<Float32Array> {
      {
        let streamedSome = false;
        // A video's sound is copied out and decoded a stretch at a time, and a stretch the browser refuses is not retried on the whole file, which is what that path exists to avoid.
        const order = decoderOrder(sound ?? { codec: null }, { audioDecoder: hasAudioDecoder(), stretchFirst: hasVideo || long });
        // A long sound the page's own decoder can read goes through it, a stretch at a time, before the whole-file decode is tried.
        if (long && !hasVideo && !wrappable && order.includes('webcodecs') && order.includes('browser')) order.splice(order.indexOf('webcodecs'), 1), order.splice(order.indexOf('browser'), 0, 'webcodecs');
        let failed = false;
        let err = cause;
        for (const step of order) {
          let source: AsyncGenerator<Float32Array> | null = null;
          try {
            if (step === 'wrap') {
              if (!hasVideo && !long) continue;
              source = demuxedStretches(input, SPEECH_RATE, onProgress, onLost);
            } else if (step === 'browser') {
              if (failed) continue;
              needsWhole();
              source = once(wholeFile(file));
            } else if (step === 'amr') {
              source = once(amrPcm(file, track, sound!, SPEECH_RATE).then((c) => c[0]!));
            } else if (track) {
              if (step === 'ac3') await ensureAc3();
              source = codecChunks(track, SPEECH_RATE, onProgress);
            }
            if (!source) continue;
            // Whether this decoder reads the sound at all is known by its first stretch; after that a failure is the run's.
            const first = await source.next();
            if (first.done) continue;
            streamedSome = true;
            yield first.value;
            for await (const chunk of source) yield chunk;
            return;
          } catch (e) {
            if (looksLikeMemory(e) || isNotReadable(e) || (step === 'wrap' && e instanceof SpeechError && e.message === NO_SOUND) || isRecordingTooLong(e) || streamedSome) throw e;
            err ??= e;
            if (step === 'wrap') failed = true;
          } finally {
            await source?.return?.(undefined);
          }
        }
        const message = undecodableMessage(sound, err);
        // A named format nothing here reads is its own kind of failure; a damaged AAC or MP3 file, or one that says nothing, stays a decode failure.
        if (refusalFor(sound) && !isUnreadable(err)) throw unsupportedSound(message, err);
        // What is left is told apart by what the browser and the container reader said, so the stats split by cause.
        if (!(await input.getFormat().catch(() => null))) throw notAnAudioFile(err);
        if (track && err instanceof Error && ['EncodingError', 'DataError'].includes(err.name)) throw audioDamaged(undefined, err);
        throw audioDecodeError(message, err);
      }
    }
  } catch (e) {
    input.dispose?.();
    throw asSpeechError(e);
  }
}

/** Rethrows a read failure; any other error is the caller's to handle (null for a missing track). */
function unlessUnreadable(e: unknown): null {
  if (isNotReadable(e)) throw e;
  return null;
}

const SPEECH_OWN = ['AudioDecodeError', 'OutOfMemoryError', 'UnsupportedSound', 'AudioDamaged', 'NotAnAudioFile'];

/** Anything a decode throws, as one of the page's own errors. */
function asSpeechError(e: unknown): Error {
  if (isNotReadable(e)) return notReadable(e);
  if (isRecordingTooLong(e)) return e as Error;
  if (e instanceof SpeechError && SPEECH_OWN.includes(e.kind)) return e;
  if (e instanceof Error && SPEECH_OWN.includes(e.name)) return e;
  return looksLikeMemory(e) ? outOfMemoryError() : audioDecodeError(undefined, e);
}

async function wholeFile(file: File): Promise<Float32Array> {
  const [samples] = channelsOf(await decodeAudio(file, SPEECH_RATE, false), true) as [Float32Array];
  return samples;
}

/** A single result as a stream of one chunk. */
async function* once(sound: Promise<Float32Array>): AsyncGenerator<Float32Array> {
  yield await sound;
}

/**
 * Decode with the page's decoder (WebCodecs, through Mediabunny), buffer by buffer, mixing to mono and averaging
 * down to `rate` as each arrives, and handing each over so none is kept. Ends at once, with nothing, when this browser has no decoder for the track.
 */
async function* codecChunks(track: InputAudioTrack, rate: number, onProgress?: (fraction: number) => void): AsyncGenerator<Float32Array> {
  if (!track.codec || !(await track.canDecode())) return;
  const seconds = await track.computeDuration();
  let written = 0;
  for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
    const step = buffer.sampleRate / rate;
    const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const at = placedAt(timestamp, written, rate);
    const n = Math.floor(buffer.length / step);
    // Sound the timestamps say was already played is not played twice; silence between buffers is kept.
    const skip = Math.max(0, written - at);
    const lead = Math.max(0, at - written);
    const out = new Float32Array(lead + Math.max(0, n - skip));
    for (let j = skip; j < n; j++) {
      const from = Math.floor(j * step);
      const to = Math.max(from + 1, Math.min(buffer.length, Math.floor((j + 1) * step)));
      let sum = 0;
      for (const ch of chans) for (let i = from; i < to; i++) sum += ch[i]!;
      out[lead + j - skip] = sum / (chans.length * (to - from));
    }
    written += out.length;
    onProgress?.(Math.min(0.99, timestamp / Math.max(1, seconds)));
    if (out.length) yield out;
  }
}

const isUnreadable = (cause: unknown) => cause instanceof Error && ['NotReadableError', 'NotFoundError'].includes(cause.name);

/** The sentence for a sound this browser could not read, naming its format where that is known. */
function undecodableMessage(sound: SoundKind | null, cause?: unknown): string {
  // A file the browser could not even read (cloud storage that is not on the device, say) is not a sound format problem.
  if (isUnreadable(cause)) return 'This file could not be read. If it is in cloud storage (Google Drive or Photos, say), save a copy on this device first and add that.';
  return undecodableText(soundFormatName(sound));
}
