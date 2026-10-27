/**
 * Join videos end to end in the browser. Each clip is decoded by Mediabunny
 * (MPL-2.0) and the browser's WebCodecs decoder, every frame is drawn onto a
 * picture the size of the first clip (letterboxed when the shapes differ),
 * and the whole is encoded once into an MP4. Each clip's sound is decoded by
 * the browser and laid end to end, with silence for clips that have none.
 * Nothing leaves the tab.
 */
import {
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  QUALITY_HIGH,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WEBM,
  getFirstEncodableAudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import { CODEC_NAMES, unplayable } from './video-compress';
import { watchEncode } from './encoder-watchdog';
import { pickVideoCodec } from './video-codec';
import { SAMPLE_RATE, decodePcm, pcmFeeder, stereo } from './pcm';
import { firstEncodableSound, noAudioEncoder } from './mp3-fallback';
import { InputError, UnsupportedCodec, NamedError } from './input-error';
import { softwareH264Offered, useRealtimeH264 } from './encoder-probe';
import { pageRecoveryHooks } from './recovery-hooks';
import { capScale, retryOf, withRecovery, type Attempt, type RetryKind } from './edit-recovery';

export interface MergeOptions {
  mute: boolean;
  onProgress?: (fraction: number) => void;
  /** Said when the run starts again after the page was hidden, or at a smaller size after the encoder gave up. */
  onNotice?: (message: string) => void;
}

export interface MergeResult {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
  videoCodec: string;
  audio: boolean;
  /** Set when a clip had sound this browser could not read or encode, so the merged video has none. */
  audioDropped: boolean;
  /** Set when the file was made on a retry after the encoder gave up or the page was hidden, or at the smaller size that worked earlier in this tab. */
  retry?: RetryKind;
}

const MAX_FPS = 60;
const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

/** How long the picture of a track lasts, from its packets. */
export async function pictureLength(track: InputVideoTrack): Promise<{ first: number; length: number }> {
  const first = await track.getFirstTimestamp();
  let end = first;
  for await (const p of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) end = Math.max(end, p.timestamp + p.duration);
  return { first, length: Math.max(0, end - first) };
}

/**
 * The sound track of every clip, when they can be joined by copying packets: this browser
 * has no audio encoder, and every clip has AAC with the same sample rate and channel count.
 */
async function copyableSound(inputs: Input[]): Promise<InputAudioTrack[] | null> {
  const tracks = await Promise.all(inputs.map((i) => i.getPrimaryAudioTrack().catch(() => null)));
  if (!tracks.some(Boolean)) return null;
  if (await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH })) return null;
  const all = tracks.filter((t): t is InputAudioTrack => !!t);
  if (all.length !== tracks.length || !all.every((t) => t.codec === 'aac')) return null;
  const [rate, channels] = await Promise.all([all[0]!.getSampleRate(), all[0]!.getNumberOfChannels()]);
  for (const t of all) if ((await t.getSampleRate()) !== rate || (await t.getNumberOfChannels()) !== channels) return null;
  return all;
}

/** Copy one clip's sound packets into the merged track, shifted to where the clip starts and cut where its picture ends. */
export async function copyClipSound(target: EncodedAudioPacketSource, track: InputAudioTrack, clip: { first: number; length: number }, offset: number) {
  const meta = { decoderConfig: (await track.getDecoderConfig()) ?? undefined };
  for await (const p of new EncodedPacketSink(track).packets()) {
    const t = p.timestamp - clip.first;
    if (t < 0) continue;
    if (t >= clip.length) break;
    await target.add(p.clone({ timestamp: offset + t }), meta);
  }
}

/** Names an encoder gives up with; a run that fails every size with one of them says so in plain words. */
const ENCODER_REFUSALS = new Set(['EncodingError', 'OperationError', 'InvalidStateError', 'NotSupportedError']);

/**
 * Joins the videos. When the device's encoder gives up (EncodingError and its kin) or the page was hidden, the run starts
 * again, at a smaller picture where the encoder is what failed (see edit-recovery.ts). If every try fails, the error keeps
 * its class name and says what to try.
 */
export async function mergeVideos(files: File[], opts: MergeOptions): Promise<MergeResult> {
  if (files.length < 2) throw new InputError('Add at least two videos to join.');
  const page = pageRecoveryHooks(opts.onNotice);
  let made = 0;
  try {
    return await withRecovery(
      async (attempt) => {
        const r = await mergeOnce(files, opts, attempt, (side) => (made = side));
        const retry = retryOf(attempt);
        return retry ? { ...r, retry } : r;
      },
      () => made,
      { ...page.hooks, softwareEncode: softwareH264Offered },
    );
  } catch (e) {
    const name = (e as { name?: string } | null)?.name ?? '';
    if (!ENCODER_REFUSALS.has(name)) throw e;
    throw new NamedError(name, "This device's video encoder stopped, even at a smaller size. Try a shorter clip, a recent Chrome, Edge or Safari, or a computer. Nothing was uploaded.", { cause: e });
  } finally {
    page.dispose();
  }
}

async function mergeOnce(files: File[], opts: MergeOptions, attempt: Attempt, sized: (longestSide: number) => void): Promise<MergeResult> {
  const inputs = files.map((f) => new Input({ source: new BlobSource(f), formats: [MP4, QTFF, WEBM, MATROSKA] }));
  try {
    const clips: { track: InputVideoTrack; first: number; length: number; name: string }[] = [];
    for (const [i, input] of inputs.entries()) {
      const track = await input.getPrimaryVideoTrack().catch(() => null);
      if (!track) throw new NamedError('VideoMergeFailed', `${files[i]!.name} has no video this page can read (MP4, MOV, WebM or MKV).`);
      if (!(await track.canDecode())) throw new UnsupportedCodec(`${files[i]!.name}: ${unplayable()}`);
      clips.push({ track, ...(await pictureLength(track)), name: files[i]!.name });
    }
    // A retry after the encoder gave up asks for a smaller picture than the first try's.
    const k = capScale(attempt, Math.max(clips[0]!.track.displayWidth, clips[0]!.track.displayHeight));
    const width = even(clips[0]!.track.displayWidth * k);
    const height = even(clips[0]!.track.displayHeight * k);
    sized(Math.max(width, height));
    // A run started again after the encoder failed asks for the encoder mode that does not stall.
    if (attempt.retry === 'smaller' || attempt.retry === 'again' || attempt.retry === 'software' || attempt.remembered) useRealtimeH264();
    const total = clips.reduce((s, c) => s + c.length, 0);
    const videoCodec = await pickVideoCodec({ width, height, bitrate: QUALITY_HIGH });
    if (!videoCodec) throw new NamedError('VideoMergeFailed', 'This browser cannot encode video at this size. Try a recent version of Chrome, Edge or Safari.');

    // Where the browser cannot encode sound (iPhone Safari) but every clip carries the same
    // AAC, the clips' own packets are laid end to end instead, with no decoding or encoding.
    const copy = opts.mute ? null : await copyableSound(inputs);

    // The sound of every clip, end to end, each padded or cut to its picture's length.
    let sound: Float32Array[] | null = null;
    const hadSound = (await Promise.all(inputs.map((i) => i.getPrimaryAudioTrack().catch(() => null)))).some(Boolean);
    if (!opts.mute && !copy) {
      const parts = await Promise.all(files.map(async (f, i) => ((await inputs[i]!.getPrimaryAudioTrack()) ? decodePcm(f) : null)));
      if (parts.some(Boolean)) {
        const len = Math.round(total * SAMPLE_RATE);
        sound = [new Float32Array(len), new Float32Array(len)];
        let at = 0;
        for (const [i, part] of parts.entries()) {
          const n = Math.round(clips[i]!.length * SAMPLE_RATE);
          if (part) {
            const [l, r] = stereo(part);
            sound[0]!.set(l!.subarray(0, Math.min(n, l!.length, len - at)), at);
            sound[1]!.set(r!.subarray(0, Math.min(n, r!.length, len - at)), at);
          }
          at += n;
        }
      }
    }
    // iOS 18 and earlier have no AudioEncoder: MP3 (encoded in WebAssembly) is the sound an MP4 can then hold.
    const audioCodec = sound ? await firstEncodableSound(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH }) : null;
    if (sound && !audioCodec) throw noAudioEncoder(true);

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, ...(attempt.retry === 'software' ? { hardwareAcceleration: 'prefer-software' as const } : {}) });
    output.addVideoTrack(videoSource, { frameRate: MAX_FPS });
    const audioSource = audioCodec ? new AudioSampleSource({ codec: audioCodec, bitrate: QUALITY_HIGH }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    const packetSource = copy ? new EncodedAudioPacketSource('aac') : null;
    if (packetSource) output.addAudioTrack(packetSource);
    await output.start();
    const feed = pcmFeeder(audioSource, audioSource ? sound : null);

    await watchEncode(
      async (progress) => {
        const report = (f: number) => {
          progress(f);
          opts.onProgress?.(f);
        };
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d')!;
        let offset = 0;
        let lastKept = -Infinity;
        for (const clip of clips) {
          for await (const sample of new VideoSampleSink(clip.track).samples()) {
            const t = offset + sample.timestamp - clip.first;
            if (t < lastKept + 1 / MAX_FPS - 1e-4 || t >= offset + clip.length) {
              sample.close();
              continue;
            }
            lastKept = t;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);
            sample.drawWithFit(ctx, { fit: 'contain' });
            const d = Math.min(sample.duration, offset + clip.length - t);
            sample.close();
            const frame = new VideoSample(canvas, { timestamp: t, duration: d });
            await feed.until(t);
            await videoSource.add(frame);
            frame.close();
            report(Math.min(0.99, t / Math.max(0.001, total)));
          }
          if (packetSource) await copyClipSound(packetSource, copy![clips.indexOf(clip)]!, clip, offset);
          offset += clip.length;
        }
        await feed.until(Infinity);
        videoSource.close();
        audioSource?.close();
        packetSource?.close();
        await output.finalize();
      },
      () => output.cancel(),
    );
    const buffer = output.target.buffer;
    if (!buffer) throw new NamedError('VideoMergeFailed', 'The video could not be written.');
    opts.onProgress?.(1);
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      width,
      height,
      duration: total,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      audio: !!audioSource || !!packetSource,
      audioDropped: !opts.mute && hadSound && !audioSource && !packetSource,
    };
  } finally {
    for (const input of inputs) input.dispose?.();
  }
}
