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
import { VIDEO_CODECS, pickVideoCodec } from './video-codec';
import { InputError, UnreadableFile } from './input-error';
import { EncoderRefused, EncoderUnavailable } from './encoder-probe';
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

/** Errors a browser's encoders raise when they refuse to start or fail at once; another size or codec may still work. */
export const ENCODER_REFUSAL = new Set(['OperationError', 'EncodingError', 'InvalidStateError', 'NotSupportedError']);

/**
 * What to try, in order. Android Chrome can say a 1080p H.264 or AAC encoder is supported and then fail
 * to create it ("Encoder creation error", an OperationError), so a refusal moves to a smaller frame
 * and, at the end, to the other codecs (VP9 and Opus in the same MP4).
 */
export const ATTEMPTS: { scale: number; video: VideoCodec[]; audio: ('aac' | 'opus')[] }[] = [
  { scale: 1, video: VIDEO_CODECS, audio: ['aac', 'opus'] },
  { scale: 2 / 3, video: VIDEO_CODECS, audio: ['aac', 'opus'] },
  { scale: 4 / 9, video: ['vp9', 'avc', 'av1'], audio: ['opus', 'aac'] },
];

/** A frame scaled down, each side kept even as H.264 needs. */
export function scaledFrame(frame: { width: number; height: number }, scale: number) {
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return scale === 1 ? { ...frame } : { width: even(frame.width), height: even(frame.height) };
}

export async function audioToVideo(
  audio: File,
  picture: ImageBitmap | null,
  opts: { shape: Shape; backdrop: Backdrop; title: string; onProgress?: (f: number) => void },
): Promise<AudioVideoResult> {
  const pcm = await decodePcm(audio);
  if (!pcm) throw new UnreadableFile('No sound could be read from this file. It may use a format this browser cannot decode.');
  const sound = stereo(pcm);
  const duration = sound[0]!.length / SAMPLE_RATE;
  if (duration < 0.1) throw new InputError('This sound is too short to make a video from.');
  for (const attempt of ATTEMPTS) {
    try {
      return await encodeStill(sound, duration, picture, opts, scaledFrame(SHAPES[opts.shape], attempt.scale), attempt.video, attempt.audio);
    } catch (e) {
      if (!(e instanceof Error) || !ENCODER_REFUSAL.has(e.name)) throw e;
    }
  }
  throw new EncoderRefused();
}

async function encodeStill(
  sound: Float32Array[],
  duration: number,
  picture: ImageBitmap | null,
  opts: { backdrop: Backdrop; title: string; onProgress?: (f: number) => void },
  frame: { width: number; height: number },
  videoCodecs: VideoCodec[],
  audioCodecs: ('aac' | 'opus')[],
): Promise<AudioVideoResult> {
  const videoCodec = await pickVideoCodec({ ...frame, bitrate: QUALITY_HIGH }, videoCodecs);
  if (!videoCodec) throw new EncoderUnavailable('This browser cannot encode video. Try a recent version of Chrome, Edge or Safari.');
  // iOS 18 and earlier have no AudioEncoder: MP3 (encoded in WebAssembly) is the sound an MP4 can then hold.
  // The sound itself is already decoded above by the page's audio decoder, not WebCodecs.
  const audioCodec = await firstEncodableSound(audioCodecs, { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: 192_000 });
  if (!audioCodec) throw noAudioEncoder(false);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  // A still picture needs very few bits; a key frame every two seconds keeps seeking quick.
  const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
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
          const d = Math.min(1, duration - t);
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
  if (!buffer) throw new Error('The video could not be written.');
  opts.onProgress?.(1);
  return { blob: new Blob([buffer], { type: 'video/mp4' }), ...frame, duration, videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec };
}
