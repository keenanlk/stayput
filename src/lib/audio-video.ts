/**
 * Turn a sound into a video: one still picture (a cover, a photo, or a plain
 * background with the title) held for the length of the audio, written as an
 * MP4 in the browser, the usual way to put music or a podcast on YouTube or
 * social apps that only take video. Mediabunny (MPL-2.0) and the browser's
 * WebCodecs encoders write the file. Nothing leaves the tab.
 */
import { AudioSampleSource, BufferTarget, Mp4OutputFormat, Output, QUALITY_HIGH, VideoSample, VideoSampleSource, getFirstEncodableAudioCodec } from 'mediabunny';
import { watchEncode } from './encoder-watchdog';
import { CODEC_NAMES } from './video-compress';
import { pickVideoCodec } from './video-codec';
import { SAMPLE_RATE, decodePcm, pcmFeeder, stereo } from './pcm';

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

/** Where a picture of `w`×`h` sits inside the frame when fitted whole (contain) or filling it (cover). */
export function placeImage(w: number, h: number, frame: { width: number; height: number }, fit: 'contain' | 'cover') {
  const scale = fit === 'contain' ? Math.min(frame.width / w, frame.height / h) : Math.max(frame.width / w, frame.height / h);
  const dw = w * scale;
  const dh = h * scale;
  return { x: (frame.width - dw) / 2, y: (frame.height - dh) / 2, width: dw, height: dh };
}

/** Draw the still frame: the picture fitted whole over a blurred copy of itself (or a plain colour), or the title on a plain colour. */
export function drawStill(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, frame: { width: number; height: number }, picture: ImageBitmap | null, backdrop: Backdrop, title: string) {
  const { width, height } = frame;
  ctx.fillStyle = backdrop === 'white' ? '#ffffff' : '#000000';
  ctx.fillRect(0, 0, width, height);
  if (picture) {
    if (backdrop === 'blur') {
      const c = placeImage(picture.width, picture.height, frame, 'cover');
      ctx.save();
      ctx.filter = `blur(${Math.round(Math.max(width, height) / 40)}px) brightness(0.6)`;
      // Overdraw a little so the blur does not fade at the edges.
      const pad = Math.max(width, height) / 20;
      ctx.drawImage(picture, c.x - pad, c.y - pad, c.width + pad * 2, c.height + pad * 2);
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

export async function audioToVideo(
  audio: File,
  picture: ImageBitmap | null,
  opts: { shape: Shape; backdrop: Backdrop; title: string; onProgress?: (f: number) => void },
): Promise<AudioVideoResult> {
  const pcm = await decodePcm(audio);
  if (!pcm) throw new Error('No sound could be read from this file. It may use a format this browser cannot decode.');
  const sound = stereo(pcm);
  const duration = sound[0]!.length / SAMPLE_RATE;
  if (duration < 0.1) throw new Error('This sound is too short to make a video from.');
  const frame = SHAPES[opts.shape];
  const videoCodec = await pickVideoCodec({ ...frame, bitrate: QUALITY_HIGH });
  if (!videoCodec) throw new Error('This browser cannot encode video. Try a recent version of Chrome, Edge or Safari.');
  const audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: 192_000 });
  if (!audioCodec) throw new Error('This browser cannot encode sound for video. Try a recent version of Chrome, Edge or Safari.');

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  // A still picture needs very few bits; a key frame every two seconds keeps seeking quick.
  const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(videoSource);
  const audioSource = new AudioSampleSource({ codec: audioCodec, bitrate: 192_000 });
  output.addAudioTrack(audioSource);
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
  const buffer = output.target.buffer;
  if (!buffer) throw new Error('The video could not be written.');
  opts.onProgress?.(1);
  return { blob: new Blob([buffer], { type: 'video/mp4' }), ...frame, duration, videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec };
}
