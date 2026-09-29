/**
 * Audio to any common format, in the browser. The browser decodes the input;
 * MP3 is written by LAME (WebAssembly), WAV and FLAC by the small writers in
 * this repo, and M4A (AAC) and OGG (Opus) by the browser's own WebCodecs
 * encoders through Mediabunny. WAV and FLAC keep the file's own sample rate so
 * a WAV to FLAC conversion is lossless.
 */
import { ALL_FORMATS, AudioSampleSource, BlobSource, BufferTarget, Input, Mp4OutputFormat, OggOutputFormat, Output, canEncodeAudio } from 'mediabunny';
import { SAMPLE_RATE as MP3_RATE, channelsOf, decodeAudio, encodeMp3, encodeWav, type Bitrate } from './audio';
import { encodeFlac } from './flac';
import { SAMPLE_RATE as OPUS_RATE, pcmFeeder } from './pcm';

export type AudioFormat = 'mp3' | 'wav' | 'flac' | 'm4a' | 'ogg';

export const FORMAT_LABELS: Record<AudioFormat, string> = {
  mp3: 'MP3',
  wav: '16-bit WAV',
  flac: 'FLAC (lossless)',
  m4a: 'M4A (AAC)',
  ogg: 'OGG (Opus)',
};

/** Formats with a bitrate choice. */
export const lossy = (f: AudioFormat) => f === 'mp3' || f === 'm4a' || f === 'ogg';

/** The sample rate the file was recorded at, or null when Mediabunny cannot tell. */
export async function sourceRate(file: File): Promise<number | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    const rate = track?.sampleRate ?? null;
    return rate && rate >= 8000 && rate <= 192000 ? rate : null;
  } catch {
    return null;
  } finally {
    input.dispose?.();
  }
}

/** The format a file already is, when this tool can write it. */
export function formatOf(name: string): AudioFormat | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'mp3' || ext === 'wav' || ext === 'flac' || ext === 'm4a' || ext === 'ogg') return ext;
  if (ext === 'wave') return 'wav';
  if (ext === 'aac' || ext === 'm4b') return 'm4a';
  if (ext === 'oga' || ext === 'opus') return 'ogg';
  return null;
}

/** Whether this browser can write the format. MP3, WAV and FLAC always can. */
export async function canWrite(format: AudioFormat, channels = 2): Promise<boolean> {
  if (format === 'm4a') return canEncodeAudio('aac', { numberOfChannels: channels, sampleRate: 48000, bitrate: 128000 }).catch(() => false);
  if (format === 'ogg') return canEncodeAudio('opus', { numberOfChannels: channels, sampleRate: 48000, bitrate: 128000 }).catch(() => false);
  return true;
}

export interface ConvertResult {
  blob: Blob;
  duration: number;
  sampleRate: number;
  channels: number;
}

export async function convertAudio(
  file: File,
  format: AudioFormat,
  opts: { bitrate: number; mono: boolean; onProgress?: (f: number) => void; transform?: (chans: Float32Array[], rate: number) => Float32Array[]; bitrateOf?: () => number },
): Promise<ConvertResult> {
  const { bitrate, mono, onProgress, transform } = opts;
  const rate = format === 'mp3' ? MP3_RATE : format === 'wav' || format === 'flac' ? (await sourceRate(file)) ?? MP3_RATE : OPUS_RATE;
  const buffer = await decodeAudio(file, rate);
  const decoded = channelsOf(buffer, mono);
  const chans = transform ? transform(decoded, rate) : decoded;
  // A transform may settle the bitrate once it has seen the sound.
  const kbps = opts.bitrateOf?.() ?? bitrate;
  const base = { duration: buffer.duration, sampleRate: rate, channels: chans.length };
  if (format === 'mp3') return { ...base, blob: await encodeMp3(chans, kbps as Bitrate, onProgress) };
  if (format === 'wav') return { ...base, blob: encodeWav(chans, rate) };
  if (format === 'flac') return { ...base, blob: await encodeFlac(chans, rate, onProgress) };

  if (!(await canWrite(format, chans.length))) {
    throw new Error(
      format === 'm4a'
        ? 'This browser has no AAC encoder, so it cannot write M4A. Safari, and Chrome or Edge on Windows and Mac, can. Or choose MP3, which plays in the same places.'
        : 'This browser has no Opus encoder, so it cannot write OGG. Chrome, Edge and Firefox can.',
    );
  }
  const target = new BufferTarget();
  const output = new Output({ format: format === 'm4a' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new OggOutputFormat(), target });
  const source = new AudioSampleSource({ codec: format === 'm4a' ? 'aac' : 'opus', bitrate: kbps * 1000 });
  output.addAudioTrack(source);
  await output.start();
  const feed = pcmFeeder(source, chans);
  const seconds = feed.length / OPUS_RATE;
  const step = 5;
  for (let t = step; t < seconds + step; t += step) {
    await feed.until(Math.min(t, seconds));
    onProgress?.(Math.min(1, t / seconds));
  }
  source.close();
  await output.finalize();
  const type = format === 'm4a' ? 'audio/mp4' : 'audio/ogg';
  return { ...base, blob: new Blob([target.buffer!], { type }) };
}
