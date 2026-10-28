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
  MPEG_TS,
  QTFF,
  QUALITY_HIGH,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WEBM,
  type VideoSamplePixelFormat,
} from 'mediabunny';
import { watchEncode } from './encoder-watchdog';
import { CODEC_NAMES, unplayable } from './video-compress';
import { InputError, NamedError, UnreadableFile, UnsupportedCodec } from './input-error';
import { pickVideoCodec } from './video-codec';
import { SAMPLE_RATE, decodePcm, pcmFeeder } from './pcm';
import { softwareH264Offered, useRealtimeH264 } from './encoder-probe';
import { pageRecoveryHooks } from './recovery-hooks';
import { capScale, retryOf, withRecovery, type Attempt, type RetryKind } from './edit-recovery';

export interface ReverseOptions {
  mute: boolean;
  onProgress?: (fraction: number) => void;
  /** Said when the run starts again after the page was hidden, or at a smaller size after the encoder gave up. */
  onNotice?: (message: string) => void;
}

export interface ReverseResult {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
  videoCodec: string;
  audio: boolean;
  /** Set when the file was made on a retry after the encoder gave up or the page was hidden, or at the smaller size that worked earlier in this tab. */
  retry?: RetryKind;
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

/** Names an encoder gives up with; a run that fails every size with one of them says so in plain words. */
const ENCODER_REFUSALS = new Set(['EncodingError', 'OperationError', 'InvalidStateError', 'NotSupportedError']);

/**
 * Reverses the video. When the device's encoder gives up (EncodingError and its kin) or the page was hidden, the run starts
 * again, at a smaller picture where the encoder is what failed (see edit-recovery.ts). If every try fails, the error keeps
 * its class name and says what to try.
 */
export async function reverseVideo(file: File, opts: ReverseOptions): Promise<ReverseResult> {
  const page = pageRecoveryHooks(opts.onNotice);
  let made = 0;
  try {
    return await withRecovery(
      async (attempt) => {
        const r = await reverseOnce(file, opts, attempt, (side) => (made = side));
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

async function reverseOnce(file: File, opts: ReverseOptions, attempt: Attempt, sized: (longestSide: number) => void): Promise<ReverseResult> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA, MPEG_TS] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new UnreadableFile('This file has no video this page can read (MP4, MOV, WebM or MKV).');
    if (!(await video.canDecode())) throw new UnsupportedCodec(unplayable());
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
    if (!(total > 0)) throw new InputError('This video has no frames to reverse.');
    const width = video.codedWidth;
    const height = video.codedHeight;
    // A retry after the encoder gave up asks for a smaller picture than the first try's: each frame is drawn at that size.
    const k = capScale(attempt, Math.max(width, height));
    const evenSide = (n: number) => Math.max(2, 2 * Math.round(n / 2));
    const outW = k < 1 ? evenSide(width * k) : width;
    const outH = k < 1 ? evenSide(height * k) : height;
    sized(Math.max(outW, outH));
    // A run started again after the encoder failed asks for the encoder mode that does not stall.
    if (attempt.retry === 'smaller' || attempt.retry === 'again' || attempt.retry === 'software' || attempt.remembered) useRealtimeH264();
    const videoCodec = await pickVideoCodec({ width: outW + (outW % 2), height: outH + (outH % 2), bitrate: QUALITY_HIGH });
    if (!videoCodec) throw new NamedError('VideoEncodeUnsupported', 'This browser cannot encode video. Use a recent version of Chrome, Edge, Safari or Firefox.');

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
    // iOS 18 and earlier have no AudioEncoder: MP3 (encoded in WebAssembly) is the sound an MP4 can then hold.
    // Loaded here: tests import this file in Node, which cannot read the encoder's vendor.json import.
    const { firstEncodableSound, noAudioEncoder } = await import('./mp3-fallback');
    const audioCodec = sound
      ? await firstEncodableSound(['aac', 'opus'], { numberOfChannels: sound.length, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH })
      : null;
    if (sound && !audioCodec) throw noAudioEncoder(true);

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, sizeChangeBehavior: 'contain', ...(attempt.retry === 'software' ? { hardwareAcceleration: 'prefer-software' as const } : {}) });
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
        const canvas = k < 1 ? new OffscreenCanvas(outW, outH) : null;
        const ctx = canvas?.getContext('2d') ?? null;
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
            const full = new VideoSample(h.data, { format: h.format, codedWidth: h.codedWidth, codedHeight: h.codedHeight, timestamp: t, duration: d });
            let frame = full;
            if (canvas && ctx) {
              full.drawWithFit(ctx, { fit: 'fill' });
              frame = new VideoSample(canvas, { timestamp: t, duration: d });
              full.close();
            }
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
    if (!buffer) throw new NamedError('VideoWriteError', 'The video could not be written.');
    opts.onProgress?.(1);
    const quarter = video.rotation === 90 || video.rotation === 270;
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      width: quarter ? outH : outW,
      height: quarter ? outW : outH,
      duration: total,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      audio: !!audioSource,
    };
  } finally {
    input.dispose?.();
  }
}
