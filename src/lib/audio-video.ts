/**
 * Turn a sound into a video: one still picture (a cover, a photo, or a plain
 * background with the title) held for the length of the audio, written as an
 * MP4 in the browser, the usual way to put music or a podcast on YouTube or
 * social apps that only take video. Mediabunny (MPL-2.0) and the browser's
 * WebCodecs encoders write the file. Nothing leaves the tab.
 */
import { AudioSampleSource, BufferTarget, Mp4OutputFormat, Output, QUALITY_HIGH, VideoSample, VideoSampleSource, type VideoCodec } from 'mediabunny';
import { watchEncode } from './encoder-watchdog';
import { CODEC_NAMES } from './video-compress';
import { codecsFor, planVideoCodec } from './video-codec';
import { adoptPlan, capScale, encodeOptions, type Attempt, type RetryKind } from './edit-recovery';
import { runRecovered } from './video-run';
import { InputError, UnreadableFile, NamedError } from './input-error';
import { EncoderUnavailable } from './encoder-probe';
import { blur as boxBlur } from './blur';
import { SAMPLE_RATE, decodePcm, pcmFeeder, stereo } from './pcm';
import { firstEncodableSound, noAudioEncoder } from './mp3-fallback';

export type Shape = 'landscape' | 'square' | 'portrait';
export type Backdrop = 'blur' | 'black' | 'white';

export const SHAPES: Record<Shape, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1920 },
};

export interface AudioVideoResult {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
  videoCodec: string;
  /** Set when the video was made on a retry after the encoder gave up or the page was hidden, or at the smaller size that worked earlier in this tab. */
  retry?: RetryKind;
}

/** Longest side the blurred backdrop is made at; it is scaled up afterwards, which also softens it. */
const BLUR_WORK = 480;

/** Where a picture of `w`×`h` sits inside the frame when fitted whole (contain) or filling it (cover). */
export function placeImage(w: number, h: number, frame: { width: number; height: number }, fit: 'contain' | 'cover') {
  const scale = fit === 'contain' ? Math.min(frame.width / w, frame.height / h) : Math.max(frame.width / w, frame.height / h);
  const dw = w * scale;
  const dh = h * scale;
  return { x: (frame.width - dw) / 2, y: (frame.height - dh) / 2, width: dw, height: dh };
}

/** Draw the still frame: the picture fitted whole over a blurred copy of itself (or a plain colour), or the title on a plain colour. */
export function drawStill(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, frame: { width: number; height: number }, picture: ImageBitmap | null, backdrop: Backdrop, title: string, fit: 'contain' | 'cover' = 'contain') {
  const { width, height } = frame;
  ctx.fillStyle = backdrop === 'white' ? '#ffffff' : '#000000';
  ctx.fillRect(0, 0, width, height);
  if (picture) {
    if (fit === 'cover') {
      const c = placeImage(picture.width, picture.height, frame, 'cover');
      ctx.drawImage(picture, c.x, c.y, c.width, c.height);
      return;
    }
    if (backdrop === 'blur') {
      const c = placeImage(picture.width, picture.height, frame, 'cover');
      // Blurred by hand on a small copy, then scaled up: Safari has no canvas `filter`, and there a filter blur does nothing.
      const k = Math.min(1, BLUR_WORK / Math.max(width, height));
      const small = new OffscreenCanvas(Math.max(2, Math.round(width * k)), Math.max(2, Math.round(height * k)));
      const sctx = small.getContext('2d', { willReadFrequently: true })!;
      sctx.drawImage(picture, c.x * k, c.y * k, c.width * k, c.height * k);
      // A Gaussian of about a fortieth of the long side; boxBlur's radius is twice the Gaussian's spread and reads clamped edges.
      const sigma = (Math.max(width, height) / 40) * k;
      boxBlur(sctx, { x: 0, y: 0, w: small.width, h: small.height }, Math.max(2, Math.round(sigma * 2)));
      // Darkened to 60%, like the filter's brightness(0.6).
      sctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      sctx.fillRect(0, 0, small.width, small.height);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(small, 0, 0, width, height);
      ctx.restore();
    }
    const p = placeImage(picture.width, picture.height, frame, 'contain');
    ctx.drawImage(picture, p.x, p.y, p.width, p.height);
    return;
  }
  ctx.fillStyle = backdrop === 'white' ? '#111111' : '#f5f5f5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = Math.round(width / 16);
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  while (size > 16 && ctx.measureText(title).width > width * 0.85) {
    size -= 4;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
  }
  ctx.fillText(title, width / 2, height / 2);
}

/** A frame scaled down, each side kept even as H.264 needs. */
function scaledFrame(frame: { width: number; height: number }, k: number) {
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return k >= 1 ? { ...frame } : { width: even(frame.width), height: even(frame.height) };
}

/**
 * The frame and codec this try writes. Android Chrome can say a 1080p H.264 or AAC encoder is supported and then fail to create it
 * ("Encoder creation error", an OperationError), so the frame starts at the size the shared recovery allows (see edit-recovery.ts):
 * the full shape, or smaller after a failure, with the test encode at the real size lowering it further before anything is drawn.
 */
export async function planStill(shape: Shape, attempt: Attempt, sized: (longestSide: number) => void): Promise<{ frame: { width: number; height: number }; videoCodec: VideoCodec }> {
  const full = SHAPES[shape];
  const longest = Math.max(full.width, full.height);
  const wanted = capScale(attempt, longest);
  const plan = await planVideoCodec({ ...scaledFrame(full, wanted), bitrate: QUALITY_HIGH }, codecsFor(attempt));
  const k = adoptPlan(attempt, plan, longest);
  const frame = scaledFrame(full, k);
  sized(Math.max(frame.width, frame.height));
  if (!plan.codec) throw new EncoderUnavailable('This browser cannot encode video. Try a recent version of Chrome, Edge or Safari.');
  return { frame, videoCodec: plan.codec };
}

export async function audioToVideo(
  audio: File,
  picture: ImageBitmap | null,
  opts: { shape: Shape; backdrop: Backdrop; title: string; onProgress?: (f: number) => void; onNotice?: (message: string) => void },
): Promise<AudioVideoResult> {
  const pcm = await decodePcm(audio);
  if (!pcm) throw new UnreadableFile('No sound could be read from this file. It may use a format this browser cannot decode.');
  const sound = stereo(pcm);
  const duration = sound[0]!.length / SAMPLE_RATE;
  if (duration < 0.1) throw new InputError('This sound is too short to make a video from.');
  return runRecovered('AudioVideoFailed', opts.onNotice, (attempt, sized) => encodeStill(sound, duration, picture, opts, attempt, sized));
}

async function encodeStill(
  sound: Float32Array[],
  duration: number,
  picture: ImageBitmap | null,
  opts: { shape: Shape; backdrop: Backdrop; title: string; onProgress?: (f: number) => void },
  attempt: Attempt,
  sized: (longestSide: number) => void,
): Promise<AudioVideoResult> {
  const { frame, videoCodec } = await planStill(opts.shape, attempt, sized);
  // iOS 18 and earlier have no AudioEncoder: MP3 (encoded in WebAssembly) is the sound an MP4 can then hold.
  // The sound itself is already decoded above by the page's audio decoder, not WebCodecs.
  const audioCodec = await firstEncodableSound(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: 192_000 });
  if (!audioCodec) throw noAudioEncoder(false);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  // A still picture needs very few bits; a key frame every two seconds keeps seeking quick.
  const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, keyFrameInterval: 2, ...encodeOptions(attempt) });
  output.addVideoTrack(videoSource);
  const audioSource = new AudioSampleSource({ codec: audioCodec, bitrate: 192_000 });
  output.addAudioTrack(audioSource);
  try {
    await output.start();
    const feed = pcmFeeder(audioSource, sound);

    const canvas = new OffscreenCanvas(frame.width, frame.height);
    drawStill(canvas.getContext('2d')!, frame, picture, opts.backdrop, opts.title);
    await watchEncode(
      async (progress) => {
        const report = (f: number) => {
          progress(f);
          opts.onProgress?.(f);
        };
        // One frame a second: players show the same picture, and the file stays small.
        for (let t = 0; t < duration; t += 1) {
          // Never shorter than one tick of 60 fps: VP8 and VP9 encoders fail on a frame with no length.
          const d = Math.max(Math.min(1, duration - t), 1 / 60);
          const sample = new VideoSample(canvas, { timestamp: t, duration: d });
          await feed.until(t);
          await videoSource.add(sample);
          sample.close();
          report(Math.min(0.99, t / duration));
        }
        await feed.until(Infinity);
        videoSource.close();
        audioSource.close();
        await output.finalize();
      },
      () => output.cancel(),
    );
  } catch (e) {
    // Free what the failed attempt holds before another one starts.
    await Promise.resolve(output.cancel()).catch(() => undefined);
    throw e;
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new NamedError('AudioVideoFailed', 'The video could not be written.');
  opts.onProgress?.(1);
  return { blob: new Blob([buffer], { type: 'video/mp4' }), ...frame, duration, videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec };
}
