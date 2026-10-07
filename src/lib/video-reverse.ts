/**
 * Play a video backwards, in the browser. Video can only be decoded forwards
 * from a keyframe, so Mediabunny (MPL-2.0) decodes it in short windows from
 * the end to the start; each window's frames are copied into memory, handed
 * to the encoder last first, and freed before the next window. The sound is
 * decoded by the browser and reversed too. Everything is encoded into an MP4
 * (H.264 and AAC where the browser has them). Nothing leaves the tab.
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
  type VideoSamplePixelFormat,
} from 'mediabunny';
import { watchEncode } from './encoder-watchdog';
import { CODEC_NAMES, unplayable } from './video-compress';
import { pickVideoCodec } from './video-codec';
import { SAMPLE_RATE, decodePcm, pcmFeeder } from './pcm';

export interface ReverseOptions {
  mute: boolean;
  onProgress?: (fraction: number) => void;
}

export interface ReverseResult {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
  videoCodec: string;
  audio: boolean;
}

/**
 * Frames held in memory at once, in bytes: about a third of a second of 1080p at 30 fps. Safari holds on to several windows' worth
 * of freed frames before it lets them go, so a larger window ran a 2-minute 1080p clip up to 3 to 4 GB; this keeps it under 1 GB.
 */
const WINDOW_BYTES = 30e6;

interface Held {
  data: ArrayBuffer;
  format: VideoSamplePixelFormat;
  codedWidth: number;
  codedHeight: number;
  timestamp: number;
  duration: number;
}

/**
 * The time windows to decode, last first. Windows never cross a keyframe, so
 * each stretch between keyframes is decoded once when it fits in one window;
 * a longer stretch is split, and its later pieces decode again from its keyframe.
 */
export function reverseWindows(keys: number[], first: number, end: number, window: number): [number, number][] {
  const bounds = [...new Set([first, ...keys.filter((k) => k > first && k < end)])].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = bounds.length - 1; i >= 0; i--) {
    const gopStart = bounds[i]!;
    const gopEnd = bounds[i + 1] ?? end;
    for (let stop = gopEnd; stop > gopStart + 1e-9; stop -= window) out.push([Math.max(gopStart, stop - window), stop]);
  }
  return out;
}

export async function reverseVideo(file: File, opts: ReverseOptions): Promise<ReverseResult> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new Error('This file has no video this page can read (MP4, MOV, WebM or MKV).');
    if (!(await video.canDecode())) throw new Error(unplayable());
    const first = await video.getFirstTimestamp();
    let end = first;
    let packets = 0;
    const keys: number[] = [];
    for await (const p of new EncodedPacketSink(video).packets(undefined, undefined, { metadataOnly: true })) {
      end = Math.max(end, p.timestamp + p.duration);
      if (p.type === 'key') keys.push(p.timestamp);
      packets++;
    }
    const total = end - first;
    if (!(total > 0)) throw new Error('This video has no frames to reverse.');
    const width = video.codedWidth;
    const height = video.codedHeight;
    const videoCodec = await pickVideoCodec({ width: width + (width % 2), height: height + (height % 2), bitrate: QUALITY_HIGH });
    if (!videoCodec) throw new Error('This browser cannot encode video. Use a recent version of Chrome, Edge, Safari or Firefox.');

    let sound: Float32Array[] | null = null;
    if (!opts.mute && (await input.getPrimaryAudioTrack())) {
      const decoded = await decodePcm(file);
      if (decoded) {
        const n = Math.round(total * SAMPLE_RATE);
        sound = decoded.map((ch) => {
          const out = new Float32Array(n);
          for (let i = 0; i < n; i++) out[i] = ch[n - 1 - i] ?? 0;
          return out;
        });
      }
    }
    const audioCodec = sound
      ? await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: sound.length, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH })
      : null;

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, sizeChangeBehavior: 'contain' });
    output.addVideoTrack(videoSource, { rotation: video.rotation });
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
        // Size the window so its frames fit in memory (4:2:0 frames take 1.5 bytes a pixel).
        const fps = Math.max(1, packets / total);
        const window = Math.min(2, Math.max(0.1, WINDOW_BYTES / (width * height * 1.5 * fps)));
        const sink = new VideoSampleSink(video);
        let lastT = Infinity;
        for (const [start, stop] of reverseWindows(keys, first, end, window)) {
          const held: Held[] = [];
          for await (const sample of sink.samples(start, stop)) {
            // A frame that straddles a window edge comes back twice; keep the first copy.
            if (sample.timestamp >= lastT || sample.timestamp >= stop || !sample.format) {
              sample.close();
              continue;
            }
            // Only the visible part: coded frames can carry a few rows of padding.
            const r = sample.visibleRect;
            const rect = { x: r.left, y: r.top, width: r.width, height: r.height };
            const data = new ArrayBuffer(sample.allocationSize({ rect }));
            await sample.copyTo(data, { rect });
            held.push({ data, format: sample.format, codedWidth: r.width, codedHeight: r.height, timestamp: sample.timestamp, duration: sample.duration });
            sample.close();
          }
          held.sort((a, b) => b.timestamp - a.timestamp);
          for (const h of held) {
            const d = h.duration || 1 / fps;
            const t = Math.max(0, total - (h.timestamp - first) - d);
            const frame = new VideoSample(h.data, { format: h.format, codedWidth: h.codedWidth, codedHeight: h.codedHeight, timestamp: t, duration: d });
            await feed.until(t);
            await videoSource.add(frame);
            frame.close();
            lastT = Math.min(lastT, h.timestamp);
            report(Math.min(0.99, t / total));
          }
          held.length = 0;
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
    const quarter = video.rotation === 90 || video.rotation === 270;
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      width: quarter ? height : width,
      height: quarter ? width : height,
      duration: total,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      audio: !!audioSource,
    };
  } finally {
    input.dispose?.();
  }
}
