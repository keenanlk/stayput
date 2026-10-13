/**
 * The sound of a video as 16 kHz mono, for the speech model, without reading
 * the whole video into memory. Mediabunny finds the sound track and hands over
 * its packets a few minutes at a time; each stretch is wrapped in a small MP4
 * (the packets are copied, not re-encoded) and decoded by the browser. Safari
 * on iPhone cannot decode a QuickTime .mov by itself, and decoding a whole
 * phone video at once can run the tab out of memory, so a file is never given
 * to the decoder as it is.
 *
 * When the browser's own decoder refuses the sound, the page's decoder
 * (WebCodecs, through Mediabunny) gets a turn, and a sound neither can read is
 * named in the message (AMR from an Android recorder, say), not reported as a
 * generic failure.
 */
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input, type InputAudioTrack } from 'mediabunny';
import { demuxedSound, grown, NO_SOUND, plannedSamples } from './demux-audio';
import { decodeAudio, channelsOf } from './audio';
import { audioDecodeError, looksLikeMemory, outOfMemoryError, SpeechError } from './speech-errors';

export const SPEECH_RATE = 16000;

/** The file's sound as mono samples at 16 kHz. Audio-only files go to the browser whole, as before. */
export async function speechSamples(file: File, onProgress?: (fraction: number) => void): Promise<Float32Array> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const hasVideo = !!(await input.getPrimaryVideoTrack().catch(() => null));
    // The first thing that went wrong on the way, kept so a failed run is named for it (a class name, never the message).
    let cause: unknown;
    const track = await input.getPrimaryAudioTrack().catch((e) => ((cause ??= e), null));
    if (hasVideo && !track) {
      // A video with no sound track is its own kind of failure to the stats, unless the reader failed with an error of its own.
      const none = audioDecodeError(NO_SOUND, cause);
      if (cause === undefined) none.name = 'NoSoundTrack';
      throw none;
    }
    let failed = false;
    if (hasVideo) {
      // A phone video's sound is copied out and decoded a stretch at a time. A stretch the browser refuses is not
      // retried on the whole file, which is what this path exists to avoid.
      try {
        const mono = await demuxedSound(input, SPEECH_RATE, true, onProgress);
        if (mono) return mono[0]!;
      } catch (e) {
        if (looksLikeMemory(e) || (e instanceof SpeechError && e.message === NO_SOUND)) throw e;
        cause ??= e;
        failed = true;
      }
    }
    if (!failed) {
      try {
        return await wholeFile(file);
      } catch (e) {
        if (looksLikeMemory(e)) throw e;
        cause ??= e;
      }
    }
    if (track) {
      try {
        const samples = await decodedByCodecs(track, SPEECH_RATE, onProgress);
        if (samples) return samples;
      } catch (e) {
        if (looksLikeMemory(e)) throw e;
        cause ??= e;
      }
    }
    throw audioDecodeError(await undecodableMessage(file, track, cause), cause);
  } catch (e) {
    throw asSpeechError(e);
  } finally {
    input.dispose?.();
  }
}

/** Anything a decode throws, as one of the page's own errors. */
function asSpeechError(e: unknown): Error {
  if (e instanceof SpeechError && ['AudioDecodeError', 'OutOfMemoryError'].includes(e.kind)) return e;
  if (e instanceof Error && ['AudioDecodeError', 'OutOfMemoryError'].includes(e.name)) return e;
  return looksLikeMemory(e) ? outOfMemoryError() : audioDecodeError(undefined, e);
}

async function wholeFile(file: File): Promise<Float32Array> {
  const [samples] = channelsOf(await decodeAudio(file, SPEECH_RATE), true) as [Float32Array];
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

/** What the sound is called to the person looking at the page. */
const FORMAT_NAMES: Record<string, string> = {
  aac: 'AAC',
  mp3: 'MP3',
  opus: 'Opus',
  vorbis: 'Vorbis',
  flac: 'FLAC',
  ac3: 'Dolby Digital (AC-3)',
  eac3: 'Dolby Digital Plus (E-AC-3)',
  dts: 'DTS',
  ulaw: 'µ-law',
  alaw: 'A-law',
  // A format Mediabunny reads but does not name: the container's own code for it.
  samr: 'AMR (the voice format of some Android recorders)',
  sawb: 'AMR-WB (the voice format of some Android recorders)',
  sawp: 'AMR-WB+',
  'ima4': 'IMA ADPCM',
};

/** The name of a track's sound format, or '' when nothing says. */
function soundFormat(track: InputAudioTrack | null): string {
  if (!track) return '';
  if (track.codec) return FORMAT_NAMES[track.codec] ?? (track.codec.startsWith('pcm') ? 'uncompressed PCM' : '');
  const id = track.internalCodecId;
  if (typeof id !== 'string') return '';
  return FORMAT_NAMES[id.toLowerCase()] ?? (/^[\x20-\x7e]{4}$/.test(id) ? `the "${id.trim()}" format` : '');
}

/** The sentence for a sound this browser could not read, naming its format where that is known. */
async function undecodableMessage(file: File, track: InputAudioTrack | null, cause?: unknown): Promise<string> {
  // A file the browser could not even read (cloud storage that is not on the device, say) is not a sound format problem.
  if (cause instanceof Error && ['NotReadableError', 'NotFoundError'].includes(cause.name)) {
    return 'This file could not be read. If it is in cloud storage (Google Drive or Photos, say), save a copy on this device first and add that.';
  }
  let format = soundFormat(track);
  // A bare .amr file has no container for the demuxer to read; its first bytes say what it is.
  if (!format && !track) {
    const head = new Uint8Array(await file.slice(0, 9).arrayBuffer().catch(() => new ArrayBuffer(0)));
    const text = new TextDecoder('latin1').decode(head);
    if (text.startsWith('#!AMR-WB')) format = FORMAT_NAMES.sawb!;
    else if (text.startsWith('#!AMR')) format = FORMAT_NAMES.samr!;
  }
  if (!format) return "No audio could be read from this file. It may have no sound track, or use an audio format this browser can't decode.";
  const common = format.startsWith('AAC') || format.startsWith('MP3');
  return common
    ? `This browser could not decode this file's ${format} sound. Try again, or try Chrome or Edge on a computer.`
    : `This file's sound is ${format}, which this browser can't decode. Try Chrome or Edge on a computer, or save the video again with AAC sound and add that.`;
}
