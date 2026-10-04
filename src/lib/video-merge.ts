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
  type InputVideoTrack,
} from 'mediabunny';
import { CODEC_NAMES, unplayable } from './video-compress';
import { watchEncode } from './encoder-watchdog';
import { pickVideoCodec } from './video-codec';
import { SAMPLE_RATE, decodePcm, pcmFeeder, stereo } from './pcm';

export interface MergeOptions {
  mute: boolean;
  onProgress?: (fraction: number) => void;
}

export interface MergeResult {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
  videoCodec: string;
  audio: boolean;
}

const MAX_FPS = 60;
const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

/** How long the picture of a track lasts, from its packets. */
async function pictureLength(track: InputVideoTrack): Promise<{ first: number; length: number }> {
  const first = await track.getFirstTimestamp();
  let end = first;
  for await (const p of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) end = Math.max(end, p.timestamp + p.duration);
  return { first, length: Math.max(0, end - first) };
}

export async function mergeVideos(files: File[], opts: MergeOptions): Promise<MergeResult> {
  if (files.length < 2) throw new Error('Add at least two videos to join.');
  const inputs = files.map((f) => new Input({ source: new BlobSource(f), formats: [MP4, QTFF, WEBM, MATROSKA] }));
  try {
    const clips: { track: InputVideoTrack; first: number; length: number; name: string }[] = [];
    for (const [i, input] of inputs.entries()) {
      const track = await input.getPrimaryVideoTrack().catch(() => null);
      if (!track) throw new Error(`${files[i]!.name} has no video this page can read (MP4, MOV, WebM or MKV).`);
      if (!(await track.canDecode())) throw new Error(`${files[i]!.name}: ${unplayable()}`);
      clips.push({ track, ...(await pictureLength(track)), name: files[i]!.name });
    }
    const width = even(clips[0]!.track.displayWidth);
    const height = even(clips[0]!.track.displayHeight);
    const total = clips.reduce((s, c) => s + c.length, 0);
    const videoCodec = await pickVideoCodec({ width, height, bitrate: QUALITY_HIGH });
    if (!videoCodec) throw new Error('This browser cannot encode video at this size. Try a recent version of Chrome, Edge or Safari.');

    // The sound of every clip, end to end, each padded or cut to its picture's length.
    let sound: Float32Array[] | null = null;
    if (!opts.mute) {
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
    const audioCodec = sound ? await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH }) : null;

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH });
    output.addVideoTrack(videoSource, { frameRate: MAX_FPS });
    const audioSource = audioCodec ? new AudioSampleSource({ codec: audioCodec, bitrate: QUALITY_HIGH }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
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
          offset += clip.length;
        }
        await feed.until(Infinity);
        videoSource.close();
        audioSource?.close();
        await output.finalize();
      },
      () => output.cancel(),
    );
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The video could not be written.');
    opts.onProgress?.(1);
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      width,
      height,
      duration: total,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      audio: !!audioSource,
    };
  } finally {
    for (const input of inputs) input.dispose?.();
  }
}
