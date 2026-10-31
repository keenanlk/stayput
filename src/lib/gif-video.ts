/**
 * GIF to MP4, entirely in the browser. The GIF is decoded frame by frame with
 * gifuct-js (MIT) and composited onto a canvas following each frame's disposal
 * rule, the way browsers play GIFs. Each finished frame is handed to the
 * browser's own video encoder (WebCodecs: H.264 where the browser has it, VP9
 * or AV1 otherwise) and the encoded frames are written into an MP4 by
 * mp4-muxer (MIT). Nothing leaves the tab.
 */
import { parseGIF, decompressFrame, type ParsedGif } from 'gifuct-js';
import { watchEncode } from './encoder-watchdog';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { parseAnimatedWebp, renderWebpFrames } from './webp-anim';
import { NamedError, UnreadableFile } from './input-error';
import { encodeOptions, retryOf, type Attempt, type RetryKind } from './edit-recovery';
import { runRecovered } from './video-run';

type GifFrame = Parameters<typeof decompressFrame>[0];

export type VideoCodecName = 'H.264' | 'VP9' | 'AV1';

export interface GifToMp4Options {
  /** How many times to play the animation, or 'auto' to repeat it to at least `minSeconds`. */
  repeat: number | 'auto';
  /** What transparent pixels become. Video has no transparency. */
  background: string;
  /** Longest side of the video, in pixels. Larger GIFs are scaled down. */
  maxSide?: number;
  onProgress?: (fraction: number) => void;
  /** Said when the run starts again after the page was hidden, or at a smaller size after the encoder gave up. */
  onNotice?: (message: string) => void;
}

export interface GifToMp4Result {
  blob: Blob;
  codec: VideoCodecName;
  width: number;
  height: number;
  /** Frames in one play of the GIF. */
  frames: number;
  /** Times the animation plays in the video. */
  plays: number;
  /** Length of the video in milliseconds. */
  duration: number;
  /** The first frame, for a preview. */
  poster: ImageBitmap;
  /** Set when the video was made on a retry after the encoder gave up or the page was hidden, or at the smaller size that worked earlier in this tab. */
  retry?: RetryKind;
}

/** The longest side a try may write: the tool's own limit (1920 unless set), lowered by a retry's or the remembered cap. A cap that takes effect is recorded for the note. */
function sideLimit(attempt: Attempt, asked: number | undefined, long: number): number {
  const own = asked ?? 1920;
  if (attempt.maxSide && attempt.maxSide < own && long > attempt.maxSide) {
    attempt.capped = true;
    return attempt.maxSide;
  }
  return own;
}

/** Repeat short loops to this length: Instagram and several chat apps reject shorter videos. */
const MIN_SECONDS = 3;

/**
 * Browsers play a GIF frame delay of 0 or 10 ms as 100 ms (such files were
 * made for old browsers that ignored the delay), so the video does the same.
 */
const frameDelay = (ms: number) => (ms <= 10 ? 100 : ms);

/** GIFs smaller than this on their long side are enlarged, so the video is not a postage stamp. */
const MIN_SIDE = 320;

const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

interface Candidate {
  codec: string;
  name: VideoCodecName;
  mux: 'avc' | 'vp9' | 'av1';
}

/** H.264 plays everywhere (iPhone Photos, WhatsApp, PowerPoint), so it comes first. */
const CANDIDATES: Candidate[] = [
  { codec: 'avc1.640028', name: 'H.264', mux: 'avc' }, // High 4.0, up to 1920x1080
  { codec: 'avc1.4d0028', name: 'H.264', mux: 'avc' }, // Main 4.0
  { codec: 'avc1.42e028', name: 'H.264', mux: 'avc' }, // Constrained Baseline 4.0
  { codec: 'vp09.00.40.08', name: 'VP9', mux: 'vp9' },
  { codec: 'av01.0.08M.08', name: 'AV1', mux: 'av1' },
];

/** The encoder configs this browser says it can do at this size, best first. */
export async function supportedCodecs(width: number, height: number, bitrate: number, framerate: number, attempt: Attempt = {}): Promise<{ config: VideoEncoderConfig; candidate: Candidate }[]> {
  if (typeof VideoEncoder === 'undefined') {
    throw new NamedError('GifVideoFailed', 'This browser cannot encode video. Use a recent version of Chrome, Edge, Safari or Firefox.');
  }
  const found: { config: VideoEncoderConfig; candidate: Candidate }[] = [];
  // Safari's encoder in quality mode takes eight frames and then never answers; real-time mode does.
  const latencyMode = attempt.latencyMode ?? (/apple/i.test(navigator.vendor ?? '') ? 'realtime' : 'quality');
  for (const candidate of CANDIDATES) {
    const config: VideoEncoderConfig = { codec: candidate.codec, width, height, bitrate, framerate, bitrateMode: 'variable', latencyMode, ...encodeOptions({ hardwareAcceleration: attempt.hardwareAcceleration }) };
    if (candidate.mux === 'avc') config.avc = { format: 'avc' };
    try {
      const { supported } = await VideoEncoder.isConfigSupported(config);
      if (supported && !found.some((f) => f.candidate.name === candidate.name)) found.push({ config, candidate });
    } catch {
      // An unknown codec string throws in some browsers; try the next one.
    }
  }
  // The last rung writes VP9 (Chromium only), when this browser offers it.
  const wanted = attempt.vp9 ? found.filter((f) => f.candidate.name === 'VP9') : found;
  if (!found.length) throw new NamedError('GifVideoFailed', 'This browser has no video encoder for this size. Try a recent version of Chrome, Edge or Safari.');
  return wanted.length ? wanted : found;
}

/** Parse the GIF, or explain what is wrong with the file. */
export function readGif(bytes: ArrayBuffer): { gif: ParsedGif; frames: GifFrame[] } {
  const head = new Uint8Array(bytes, 0, Math.min(6, bytes.byteLength));
  if (String.fromCharCode(...head).slice(0, 3) !== 'GIF') throw new UnreadableFile('This file is not a GIF.');
  const gif = parseGIF(bytes);
  const frames = gif.frames.filter((f): f is GifFrame => 'image' in f);
  if (!frames.length || !gif.lsd.width || !gif.lsd.height) throw new UnreadableFile('This GIF has no frames to convert.');
  return { gif, frames };
}

/**
 * GIF to MP4. When the device's encoder gives up (EncodingError and its kin) or the page was hidden, the run starts again,
 * at a smaller picture where the encoder is what failed (see edit-recovery.ts).
 */
export function gifToMp4(bytes: ArrayBuffer, opts: GifToMp4Options): Promise<GifToMp4Result> {
  return runRecovered('GifVideoFailed', opts.onNotice, (attempt, sized) => gifToMp4Once(bytes, opts, attempt, sized));
}

async function gifToMp4Once(bytes: ArrayBuffer, opts: GifToMp4Options, attempt: Attempt, sized: (longestSide: number) => void): Promise<GifToMp4Result> {
  const { gif, frames } = readGif(bytes);
  const gw = gif.lsd.width;
  const gh = gif.lsd.height;
  const delays = frames.map((f) => frameDelay(f.gce ? (f.gce.delay || 0) * 10 : 100));
  const loopMs = delays.reduce((a, b) => a + b, 0);
  const plays = opts.repeat === 'auto' ? Math.max(1, Math.ceil((MIN_SECONDS * 1000) / loopMs)) : Math.max(1, opts.repeat);

  // Tiny GIFs (emoji, pixel art) are enlarged by a whole number so pixels stay crisp;
  // large ones are scaled down to what H.264 level 4.0 allows. Encoders want even sides.
  const long = Math.max(gw, gh);
  const maxSide = sideLimit(attempt, opts.maxSide, long);
  const scale = long < MIN_SIDE ? Math.floor(MIN_SIDE / long) : Math.min(1, maxSide / long);
  const width = even(gw * scale);
  const height = even(gh * scale);
  sized(Math.max(width, height));
  const fps = Math.min(60, Math.max(1, Math.round((1000 * frames.length) / loopMs)));
  // Generous for GIF content: flat colours compress very well at any rate.
  const bitrate = Math.round(Math.min(16e6, Math.max(8e5, width * height * fps * 0.2)));
  const codecs = await supportedCodecs(width, height, bitrate, fps, attempt);
  const job: Job = { source: gifSource(gif, frames, gw, gh, delays), count: frames.length, delays, plays, width, height, fps, crisp: scale > 1, background: opts.background, onProgress: opts.onProgress };
  const r = await encodeWithFallback(codecs, job);
  const retry = retryOf(attempt);
  return retry ? { ...r, retry } : r;
}

/** Why a WebP could not be made into a video, with what to try next. The page shows `link` after the message. */
export class WebpError extends Error {
  link?: { href: string; text: string };
  constructor(name: string, message: string, link?: { href: string; text: string }) {
    super(message);
    this.name = name;
    this.link = link;
  }
}

const stillWebp = () => new WebpError('WebpNotAnimated', 'This WebP has one frame, so there is no animation to turn into a video. Use WebP to PNG or JPG for a still image:', { href: '/webp-to-png', text: 'WebP to PNG' });

/** True when the bytes are a WebP file (animated or not). */
export const isWebp = (b: Uint8Array) => b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP';

/**
 * Animated WebP to MP4, straight from the WebP's own frames (never through a
 * GIF, whose 256-colour palette would degrade them). The video keeps the
 * canvas size, rounded to even, and each frame's own duration; transparency
 * becomes `background`.
 */
export function webpToMp4(bytes: ArrayBuffer, opts: GifToMp4Options): Promise<GifToMp4Result> {
  return runRecovered('GifVideoFailed', opts.onNotice, (attempt, sized) => webpToMp4Once(bytes, opts, attempt, sized));
}

async function webpToMp4Once(bytes: ArrayBuffer, opts: GifToMp4Options, attempt: Attempt, sized: (longestSide: number) => void): Promise<GifToMp4Result> {
  const u8 = new Uint8Array(bytes);
  if (!isWebp(u8)) throw new WebpError('NotAWebp', 'This file is not a WebP image. Some apps save animations as GIF or video under a .webp name. Save the animation again from the original app.');
  let anim;
  try {
    anim = parseAnimatedWebp(u8);
  } catch {
    throw new WebpError('DamagedWebp', 'This WebP could not be read. It may be damaged or cut short: download or save it again, then try once more.');
  }
  if (!anim || anim.frames.length < 2) throw stillWebp();
  const delays = anim.frames.map((f) => frameDelay(f.duration));
  const loopMs = delays.reduce((a, b) => a + b, 0);
  const plays = opts.repeat === 'auto' ? Math.max(1, Math.ceil((MIN_SECONDS * 1000) / loopMs)) : Math.max(1, opts.repeat);
  const long = Math.max(anim.width, anim.height);
  const scale = Math.min(1, sideLimit(attempt, opts.maxSide, long) / long);
  const width = even(anim.width * scale);
  const height = even(anim.height * scale);
  sized(Math.max(width, height));
  const fps = Math.min(60, Math.max(1, Math.round((1000 * anim.frames.length) / loopMs)));
  const bitrate = Math.round(Math.min(16e6, Math.max(8e5, width * height * fps * 0.2)));
  const codecs = await supportedCodecs(width, height, bitrate, fps, attempt);
  const source: FrameSource = async (emit) => {
    const tmp = new OffscreenCanvas(anim.width, anim.height);
    const tctx = tmp.getContext('2d')!;
    await renderWebpFrames(anim, async (rgba, _ms, i) => {
      tctx.putImageData(rgba, 0, 0);
      await emit(tmp, delays[i]!);
    });
  };
  const r = await encodeWithFallback(codecs, { source, count: anim.frames.length, delays, plays, width, height, fps, crisp: false, background: opts.background, onProgress: opts.onProgress });
  const retry = retryOf(attempt);
  return retry ? { ...r, retry } : r;
}

async function encodeWithFallback(codecs: Awaited<ReturnType<typeof supportedCodecs>>, job: Job): Promise<GifToMp4Result> {
  // Writes with the best codec this browser offers (H.264 first). A hardware encoder can accept a config and still fail on the first
  // frame; that is left to the shared recovery (the same size with another setting, a smaller picture, VP9 last; see edit-recovery.ts),
  // so a failure is not answered by a codec the person's player may not open, and a hidden page is waited out first.
  const { config, candidate } = codecs[0]!;
  return encode(job, config, candidate);
}

/** Draws one play of the animation, calling `emit` with each composited frame and how long it shows (ms). */
type FrameSource = (emit: (image: CanvasImageSource, duration: number) => Promise<void>) => Promise<void>;

interface Job {
  source: FrameSource;
  /** Frames in one play. */
  count: number;
  delays: number[];
  plays: number;
  width: number;
  height: number;
  fps: number;
  crisp: boolean;
  background: string;
  onProgress?: (fraction: number) => void;
}

/** Composite a GIF's frames in order, following each frame's disposal rule. */
function gifSource(gif: ParsedGif, frames: GifFrame[], gw: number, gh: number, delays: number[]): FrameSource {
  return async (emit) => {
    const comp = new OffscreenCanvas(gw, gh);
    const cctx = comp.getContext('2d', { willReadFrequently: true })!;
    const patch = new OffscreenCanvas(1, 1);
    const pctx = patch.getContext('2d')!;
    for (const [i, frame] of frames.entries()) {
      const f = decompressFrame(frame, gif.gct, true);
      const { left, top, width: fw, height: fh } = f.dims;
      // Disposal 3 puts back whatever was there before this frame once it has been shown.
      const restore = f.disposalType === 3 ? cctx.getImageData(0, 0, gw, gh) : undefined;
      if (fw > 0 && fh > 0) {
        if (patch.width !== fw || patch.height !== fh) {
          patch.width = fw;
          patch.height = fh;
        }
        pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), fw, fh), 0, 0);
        cctx.drawImage(patch, left, top);
      }
      await emit(comp, delays[i]!);
      if (f.disposalType === 2) cctx.clearRect(left, top, fw, fh);
      else if (restore) cctx.putImageData(restore, 0, 0);
    }
  };
}

async function encode(job: Job, config: VideoEncoderConfig, candidate: Candidate): Promise<GifToMp4Result> {
  const { count, plays, width, height, fps } = job;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: candidate.mux, width, height, frameRate: fps },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failure: unknown;
  let outputs = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      outputs++;
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => (failure ??= e),
  });
  encoder.configure(config);

  // The video frame: the composite over the background, scaled to size.
  const out = new OffscreenCanvas(width, height);
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = !job.crisp;
  octx.imageSmoothingQuality = 'high';

  const total = count * plays;
  const keyEvery = Math.max(1, fps * 2);
  let poster: ImageBitmap | undefined;
  let t = 0; // microseconds
  let n = 0;
  let needKey = false;
  try {
    await watchEncode(
      async (progress) => {
        for (let play = 0; play < plays; play++) {
          await job.source(async (image, ms) => {
            if (failure) throw failure;
            octx.fillStyle = job.background;
            octx.fillRect(0, 0, width, height);
            octx.drawImage(image, 0, 0, width, height);
            poster ??= await createImageBitmap(out);

            const duration = ms * 1000;
            const vf = new VideoFrame(out, { timestamp: t, duration });
            encoder.encode(vf, { keyFrame: needKey || n % keyEvery === 0 });
            needKey = false;
            vf.close();
            t += duration;
            n++;

            // Let the encoder catch up rather than queueing hundreds of frames in memory.
            // Some encoders (Safari's) hold frames back to look ahead and release nothing until
            // flushed; if the queue stops draining, flush rather than waiting forever.
            let idle = 0;
            let seen = outputs;
            while (encoder.encodeQueueSize > 8 && !failure) {
              await new Promise((r) => setTimeout(r, 4));
              if (outputs !== seen) [seen, idle] = [outputs, 0];
              else if (++idle > 25) {
                await encoder.flush();
                needKey = true;
                break;
              }
            }
            progress(n / total);
            job.onProgress?.(n / total);
          });
        }
        await encoder.flush();
        if (failure) throw failure;
      },
      () => encoder.close(),
    );
  } catch (e) {
    poster?.close();
    throw e;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  muxer.finalize();
  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  return { blob, codec: candidate.name, width, height, frames: count, plays, duration: t / 1000, poster: poster! };
}
