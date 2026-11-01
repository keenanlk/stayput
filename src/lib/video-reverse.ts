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
import { codecsFor, planVideoCodec } from './video-codec';
import { SAMPLE_RATE, decodePcm, pcmFeeder } from './pcm';
import { capAtRisk, pageRecoveryHooks } from './recovery-hooks';
import { nameBare } from './bare-error';
import { retryUnreadable } from './read-failure';
import { adoptPlan, capScale, encodeOptions, retryOf, withRecovery, type Attempt, type RetryKind } from './edit-recovery';

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

/** Pixel formats a frame can be copied out in and handed to the encoder as they are: 8-bit 4:2:0, and RGB the canvas gives. Anything else (10-bit, 4:2:2, 4:4:4, or a format the browser does not report) is drawn to a canvas first. */
const DIRECT_FORMATS = new Set<string>(['I420', 'I420A', 'NV12', 'RGBA', 'RGBX', 'BGRA', 'BGRX']);

/** Runs one step of a reverse run; a plain Error out of it takes the step's name, and one that already has a name is left alone so the retry rules still see it. */
async function stage<T>(name: string, step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (e) {
    throw nameBare(name, e);
  }
}

/** Reverses a sound held as one array per channel, in place, to `length` samples (shorter sounds are padded with silence at the end first). Returns the arrays that hold the reversed sound. */
export function reverseInPlace(channels: Float32Array[], length: number): Float32Array[] {
  return channels.map((ch) => {
    let out = ch;
    if (ch.length > length) out = ch.subarray(0, length);
    else if (ch.length < length) {
      out = new Float32Array(length);
      out.set(ch);
    }
    return out.reverse();
  });
}

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


/**
 * Reverses the video. When the device's encoder gives up (EncodingError and its kin) or the page was hidden, the run starts
 * again, at a smaller picture where the encoder is what failed (see edit-recovery.ts). If every try fails, the error keeps
 * its class name and says what to try.
 */
export async function reverseVideo(file: File, opts: ReverseOptions): Promise<ReverseResult> {
  const page = pageRecoveryHooks(opts.onNotice);
  let made = 0;
  try {
    // A file the phone could not read is read once more.
    return await retryUnreadable(
      file,
      () =>
        withRecovery(
          async (attempt) => {
            const r = await reverseOnce(file, opts, attempt, (side) => (made = side));
            const retry = retryOf(attempt);
            return retry ? { ...r, retry } : r;
          },
          () => made,
          page.hooks,
        ),
      opts.onNotice,
    );
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
    await stage('ReverseIndex', async () => {
      for await (const p of new EncodedPacketSink(video).packets(undefined, undefined, { metadataOnly: true })) {
        end = Math.max(end, p.timestamp + p.duration);
        if (p.type === 'key') keys.push(p.timestamp);
        packets++;
      }
    });
    const total = end - first;
    if (!(total > 0)) throw new InputError('This video has no frames to reverse.');
    const width = video.codedWidth;
    const height = video.codedHeight;
    // A retry after the encoder gave up asks for a smaller picture than the first try's: each frame is drawn at that size.
    // A phone given a 4K source starts at 1080p; the test encode below can lower the size further before the picture is read.
    const longest = Math.max(width, height);
    capAtRisk(attempt, longest);
    const evenSide = (n: number) => Math.max(2, 2 * Math.round(n / 2));
    // Always even: the encoder was checked at an even size, and an odd picture (853x481) cannot be encoded as it is.
    const sizeAt = (k: number) => ({ w: k < 1 ? evenSide(width * k) : evenSide(width), h: k < 1 ? evenSide(height * k) : evenSide(height) });
    let k = capScale(attempt, longest);
    const wanted = sizeAt(k);
    const plan = await planVideoCodec({ width: wanted.w, height: wanted.h, bitrate: QUALITY_HIGH }, codecsFor(attempt));
    k = Math.min(k, adoptPlan(attempt, plan, longest));
    const { w: outW, h: outH } = sizeAt(k);
    sized(Math.max(outW, outH));
    const videoCodec = plan.codec;
    if (!videoCodec) throw new NamedError('VideoEncodeUnsupported', 'This browser cannot encode video. Use a recent version of Chrome, Edge, Safari or Firefox.');

    let sound: Float32Array[] | null = null;
    if (!opts.mute && (await input.getPrimaryAudioTrack())) {
      const decoded = await decodePcm(file);
      if (decoded) {
        const n = Math.round(total * SAMPLE_RATE);
        // Reversed where it lies: the sound is held once, not as the original and a reversed copy.
        sound = reverseInPlace(decoded, n);
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
    const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, sizeChangeBehavior: 'contain', ...encodeOptions(attempt) });
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
        const fps = Math.max(1, packets / total);
        const sink = new VideoSampleSink(video);
        // A frame is drawn to a canvas of the output size and read back as RGBA (4 bytes a pixel) when the browser reports no pixel
        // format or a 10-bit one, when the picture is scaled down, or when its visible size is not the even output size.
        // Otherwise it is copied out as it is (8-bit 4:2:0 takes 1.5 bytes a pixel). Look at the last frame to size the windows.
        let canvasPath = k < 1 || width !== outW || height !== outH;
        const probe = await stage('ReverseDecode', () => sink.getSample(Math.max(first, end - 1e-3)));
        if (probe) {
          const r = probe.visibleRect;
          if (!probe.format || !DIRECT_FORMATS.has(probe.format) || r.width !== outW || r.height !== outH) canvasPath = true;
          probe.close();
        }
        const window = Math.min(2, Math.max(0.1, WINDOW_BYTES / (canvasPath ? outW * outH * 4 : width * height * 1.5) / fps));
        let canvas: OffscreenCanvas | null = null;
        let ctx: OffscreenCanvasRenderingContext2D | null = null;
        const drawing = () => {
          if (!canvas) {
            canvas = new OffscreenCanvas(outW, outH);
            ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new NamedError('CanvasUnavailable', 'This browser could not draw the video frames.');
          }
          return ctx!;
        };
        let lastT = Infinity;
        let added = 0;
        for (const [start, stop] of reverseWindows(keys, first, end, window)) {
          const held: Held[] = [];
          const frames = sink.samples(start, stop)[Symbol.asyncIterator]();
          try {
            for (;;) {
              const next = await stage('ReverseDecode', () => frames.next());
              if (next.done) break;
              const sample = next.value;
              try {
                // A frame that straddles a window edge comes back twice; keep the first copy.
                if (sample.timestamp >= lastT || sample.timestamp >= stop) continue;
                // Only the visible part: coded frames can carry a few rows of padding.
                const r = sample.visibleRect;
                const direct = !!sample.format && DIRECT_FORMATS.has(sample.format) && r.width === outW && r.height === outH;
                if (direct) {
                  const rect = { x: r.left, y: r.top, width: r.width, height: r.height };
                  const data = new ArrayBuffer(sample.allocationSize({ rect }));
                  await stage('ReverseCopy', () => sample.copyTo(data, { rect }));
                  held.push({ data, format: sample.format!, codedWidth: r.width, codedHeight: r.height, timestamp: sample.timestamp, duration: sample.duration });
                } else {
                  // No usable pixel format, 10-bit, or not the output size: the canvas turns it into the 8-bit RGBA the encoder takes.
                  const c = drawing();
                  const data = await stage('ReverseCopy', async () => {
                    sample.drawWithFit(c, { fit: 'fill' });
                    return c.getImageData(0, 0, outW, outH).data.buffer as ArrayBuffer;
                  });
                  held.push({ data, format: 'RGBA', codedWidth: outW, codedHeight: outH, timestamp: sample.timestamp, duration: sample.duration });
                }
              } finally {
                sample.close();
              }
            }
          } finally {
            await frames.return?.(undefined);
          }
          held.sort((a, b) => b.timestamp - a.timestamp);
          for (const h of held) {
            const d = h.duration || 1 / fps;
            const t = Math.max(0, total - (h.timestamp - first) - d);
            const frame = new VideoSample(h.data, { format: h.format, codedWidth: h.codedWidth, codedHeight: h.codedHeight, timestamp: t, duration: d });
            try {
              await stage('ReverseEncode', async () => {
                await feed.until(t);
                await videoSource.add(frame);
              });
            } finally {
              frame.close();
            }
            added++;
            lastT = Math.min(lastT, h.timestamp);
            report(Math.min(0.99, t / total));
          }
          held.length = 0;
        }
        // Nothing reached the encoder (every frame was unreadable): the file is one this browser cannot play, not a failed write.
        if (!added) throw new UnsupportedCodec(unplayable());
        await stage('ReverseEncode', () => feed.until(Infinity));
        videoSource.close();
        audioSource?.close();
        await stage('ReverseFinalize', () => output.finalize());
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
