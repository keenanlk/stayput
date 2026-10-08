/**
 * The sound track of a video as plain samples, without handing the browser's
 * decoder the whole file. Mediabunny finds the sound track and hands over its
 * packets a few minutes at a time; each stretch is wrapped in a small MP4 (the
 * packets are copied, not re-encoded) and decoded by the browser. Safari
 * cannot decode a QuickTime .mov (what an iPhone records) by itself, and
 * decoding a whole phone video at once can run the tab out of memory.
 */
import { ALL_FORMATS, BlobSource, Input, EncodedAudioPacketSource, EncodedPacketSink, BufferTarget, Mp4OutputFormat, Output, type EncodedPacket } from 'mediabunny';
import { channelsOf } from './audio';
import { audioDecodeError } from './speech-errors';

/** Seconds of sound decoded in one go. */
const STRETCH = 300;
/** Packets decoded before each stretch (and thrown away) so the decoder has warmed up where the real sound starts. */
const PRE_ROLL = 4;
/** Codecs the browsers' own decoders read from an MP4 wrapper. */
const WRAPPABLE = new Set(['aac', 'mp3']);

export const NO_SOUND = 'No sound track was found in this file, so there is no speech to write down.';

/** A file's sound as `demuxedSound` reads it, or null when the file has no sound track that can be copied out. */
export async function demuxedFileSound(file: Blob, rate: number, mono: boolean): Promise<Float32Array[] | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    return await demuxedSound(input, rate, mono);
  } finally {
    input.dispose?.();
  }
}

/**
 * The input's sound as one or two channels (one when `mono`) at `rate`, or null
 * when it has no sound track this can copy into a wrapper. Throws when the
 * track is there but the browser cannot decode it, or has no sound in it.
 */
export async function demuxedSound(input: Input, rate: number, mono: boolean, onProgress?: (fraction: number) => void): Promise<Float32Array[] | null> {
  const track = await input.getPrimaryAudioTrack().catch(() => null);
  if (!track || !track.codec || !WRAPPABLE.has(track.codec)) return null;
  const config = await track.getDecoderConfig();
  if (!config) return null;

  const length = Math.ceil((await input.computeDuration()) * rate) + rate;
  let out: Float32Array[] | null = null;
  let written = 0;
  let packets: EncodedPacket[] = [];
  let tail: EncodedPacket[] = [];
  let spanStart = 0;

  const flush = async () => {
    if (packets.length === 0) return;
    const chans = await decodeStretch(tail, packets, config, rate, mono);
    out ??= chans.map(() => new Float32Array(length));
    const at = Math.round(spanStart * rate);
    for (const [c, ch] of chans.entries()) out[Math.min(c, out.length - 1)]!.set(ch.subarray(0, Math.max(0, Math.min(ch.length, length - at))), at);
    written = Math.max(written, at + chans[0]!.length);
    tail = packets.slice(-PRE_ROLL);
    packets = [];
  };

  const duration = Math.max(1, length / rate);
  for await (const p of new EncodedPacketSink(track).packets()) {
    if (packets.length === 0) spanStart = Math.max(0, p.timestamp);
    packets.push(p);
    if (p.timestamp - spanStart >= STRETCH) {
      await flush();
      onProgress?.(Math.min(0.99, p.timestamp / duration));
    }
  }
  await flush();
  if (written === 0 || !out) throw audioDecodeError(NO_SOUND);
  const end = Math.min(length, written);
  return (out as Float32Array[]).map((ch) => ch.subarray(0, end));
}

/** Wrap some packets in an MP4 and decode it; the pre-roll packets are decoded too, then dropped from the front. */
async function decodeStretch(preRoll: EncodedPacket[], packets: EncodedPacket[], config: AudioDecoderConfig, rate: number, mono: boolean): Promise<Float32Array[]> {
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
  const ctx = new OfflineAudioContext(2, 1, rate);
  const decoded = await ctx.decodeAudioData(bytes);
  const skip = Math.round((packets[0]!.timestamp - t0) * rate);
  return channelsOf(decoded, mono).map((ch) => ch.subarray(Math.min(skip, ch.length)));
}
