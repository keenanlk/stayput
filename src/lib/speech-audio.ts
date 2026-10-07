/**
 * The sound of a video as 16 kHz mono, for the speech model, without reading
 * the whole video into memory. Mediabunny finds the sound track and hands over
 * its packets a few minutes at a time; each stretch is wrapped in a small MP4
 * (the packets are copied, not re-encoded) and decoded by the browser. Safari
 * on iPhone cannot decode a QuickTime .mov by itself, and decoding a whole
 * phone video at once can run the tab out of memory, so a file is never given
 * to the decoder as it is.
 */
import { ALL_FORMATS, BlobSource, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink, Input, Mp4OutputFormat, Output, type EncodedPacket } from 'mediabunny';
import { decodeAudio, channelsOf } from './audio';
import { audioDecodeError, looksLikeMemory, outOfMemoryError } from './speech-errors';

export const SPEECH_RATE = 16000;
/** Seconds of sound decoded in one go. */
const STRETCH = 300;
/** Packets decoded before each stretch (and thrown away) so the decoder has warmed up where the real sound starts. */
const PRE_ROLL = 4;
/** Codecs the browsers' own decoders read from an MP4 wrapper. */
const WRAPPABLE = new Set(['aac', 'mp3']);

const NO_SOUND = 'No sound track was found in this file, so there is no speech to write down.';

/** The file's sound as mono samples at 16 kHz. Audio-only files go to the browser whole, as before. */
export async function speechSamples(file: File, onProgress?: (fraction: number) => void): Promise<Float32Array> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.getPrimaryVideoTrack().catch(() => null))) return await wholeFile(file);
    const track = await input.getPrimaryAudioTrack().catch(() => null);
    if (!track) throw audioDecodeError(NO_SOUND);
    if (!track.codec || !WRAPPABLE.has(track.codec)) return await wholeFile(file);
    const config = await track.getDecoderConfig();
    if (!config) return await wholeFile(file);

    const length = Math.ceil((await input.computeDuration()) * SPEECH_RATE) + SPEECH_RATE;
    const out = new Float32Array(length);
    let written = 0;
    let packets: EncodedPacket[] = [];
    let tail: EncodedPacket[] = [];
    let spanStart = 0;

    const flush = async () => {
      if (packets.length === 0) return;
      const mono = await decodeStretch(tail, packets, config);
      const at = Math.round(spanStart * SPEECH_RATE);
      out.set(mono.subarray(0, Math.max(0, Math.min(mono.length, length - at))), at);
      written = Math.max(written, at + mono.length);
      tail = packets.slice(-PRE_ROLL);
      packets = [];
    };

    const duration = Math.max(1, length / SPEECH_RATE);
    for await (const p of new EncodedPacketSink(track).packets()) {
      if (packets.length === 0) spanStart = Math.max(0, p.timestamp);
      packets.push(p);
      if (p.timestamp - spanStart >= STRETCH) {
        await flush();
        onProgress?.(Math.min(0.99, p.timestamp / duration));
      }
    }
    await flush();
    if (written === 0) throw audioDecodeError(NO_SOUND);
    return out.subarray(0, Math.min(length, written));
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

/** Wrap some packets in an MP4 and decode it; the pre-roll packets are decoded too, then dropped from the front. */
async function decodeStretch(preRoll: EncodedPacket[], packets: EncodedPacket[], config: AudioDecoderConfig): Promise<Float32Array> {
  const all = [...preRoll, ...packets];
  const t0 = all[0]!.timestamp;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const source = new EncodedAudioPacketSource(config.codec.startsWith('mp3') ? 'mp3' : 'aac');
  output.addAudioTrack(source);
  await output.start();
  for (const [i, p] of all.entries()) await source.add(p.clone({ timestamp: p.timestamp - t0 }), i === 0 ? { decoderConfig: config } : undefined);
  source.close();
  await output.finalize();
  const bytes = output.target.buffer;
  if (!bytes) throw audioDecodeError();
  const ctx = new OfflineAudioContext(2, 1, SPEECH_RATE);
  const decoded = await ctx.decodeAudioData(bytes);
  const [mono] = channelsOf(decoded, true) as [Float32Array];
  const skip = Math.round((packets[0]!.timestamp - t0) * SPEECH_RATE);
  return mono.subarray(Math.min(skip, mono.length));
}
