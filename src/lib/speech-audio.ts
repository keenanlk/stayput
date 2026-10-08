/**
 * The sound of a video as 16 kHz mono, for the speech model, without reading
 * the whole video into memory. Mediabunny finds the sound track and hands over
 * its packets a few minutes at a time; each stretch is wrapped in a small MP4
 * (the packets are copied, not re-encoded) and decoded by the browser. Safari
 * on iPhone cannot decode a QuickTime .mov by itself, and decoding a whole
 * phone video at once can run the tab out of memory, so a file is never given
 * to the decoder as it is.
 */
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { demuxedSound, NO_SOUND } from './demux-audio';
import { decodeAudio, channelsOf } from './audio';
import { audioDecodeError, looksLikeMemory, outOfMemoryError } from './speech-errors';

export const SPEECH_RATE = 16000;

/** The file's sound as mono samples at 16 kHz. Audio-only files go to the browser whole, as before. */
export async function speechSamples(file: File, onProgress?: (fraction: number) => void): Promise<Float32Array> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.getPrimaryVideoTrack().catch(() => null))) return await wholeFile(file);
    const track = await input.getPrimaryAudioTrack().catch(() => null);
    if (!track) throw audioDecodeError(NO_SOUND);
    const mono = await demuxedSound(input, SPEECH_RATE, true, onProgress);
    return mono ? mono[0]! : await wholeFile(file);
  } catch (e) {
    throw asSpeechError(e);
  } finally {
    input.dispose?.();
  }
}

/** Anything a decode throws, as one of the page's own errors. */
function asSpeechError(e: unknown): Error {
  if (e instanceof Error && ['AudioDecodeError', 'OutOfMemoryError'].includes(e.name)) return e;
  return looksLikeMemory(e) ? outOfMemoryError() : audioDecodeError(e instanceof Error && e.message ? e.message : undefined);
}

async function wholeFile(file: File): Promise<Float32Array> {
  const [samples] = channelsOf(await decodeAudio(file, SPEECH_RATE), true) as [Float32Array];
  return samples;
}
