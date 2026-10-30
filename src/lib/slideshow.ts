/**
 * Photos (and, if wanted, a song) into one MP4 slideshow, written in the
 * browser by WebCodecs and Mediabunny, the same way audio to video writes
 * its still. Photos are decoded one at a time and held as frame-sized
 * pictures only while they are on screen or fading in. Nothing leaves the tab.
 */
import { AudioSample, AudioSampleSource, BufferTarget, Mp4OutputFormat, Output, QUALITY_HIGH, VideoSample, VideoSampleSource, type VideoCodec } from 'mediabunny';
import { watchEncode } from './encoder-watchdog';
import { CODEC_NAMES } from './video-compress';
import { pickVideoCodec } from './video-codec';
import { InputError, UnreadableFile, NamedError } from './input-error';
import { EncoderRefused, EncoderUnavailable } from './encoder-probe';
import { SAMPLE_RATE, decodePcm, stereo } from './pcm';
import { firstEncodableSound, noAudioEncoder } from './mp3-fallback';
import { decodeImage, drawScaled } from './image';
import { ATTEMPTS, ENCODER_REFUSAL, SHAPES, drawStill, scaledFrame, type AudioVideoResult, type Backdrop, type Shape } from './audio-video';

export const MAX_PHOTOS = 100;
export const FADE_SECONDS = 0.5;
const FADE_FPS = 20;
const SONG_FADE = 1;

export interface SlideshowOptions {
  shape: Shape;
  /** 'blur' and the plain colours show the whole photo; 'fill' crops it to the frame. */
  fit: 'fit' | 'fill';
  backdrop: Backdrop;
  secondsPer: number;
  crossfade: boolean;
  song?: File | null;
  onProgress?: (f: number) => void;
}

/** One photo as a ready frame: scaled to the frame first so a 40-megapixel photo is not kept whole. */
async function frameOf(file: File, frame: { width: number; height: number }, o: SlideshowOptions): Promise<ImageBitmap> {
  const { bitmap } = await decodeImage(file);
  const k = Math.min(1, (2 * frame.width) / bitmap.width, (2 * frame.height) / bitmap.height);
  const small = k < 1 ? await createImageBitmap(drawScaled(bitmap, Math.max(1, Math.round(bitmap.width * k)), Math.max(1, Math.round(bitmap.height * k)))) : bitmap;
  if (small !== bitmap) bitmap.close();
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  drawStill(canvas.getContext('2d')!, frame, small, o.backdrop, '', o.fit === 'fill' ? 'cover' : 'contain');
  small.close();
  const out = await createImageBitmap(canvas);
  return out;
}

/** Sound the length of the slideshow: cut with a fade at the end, or looped when shorter. Produced in pieces, not in one array. */
function songFeeder(source: AudioSampleSource, sound: Float32Array[], total: number) {
  const len = sound[0]!.length;
  const end = Math.round(total * SAMPLE_RATE);
  const fadeLen = Math.min(end, Math.round(SONG_FADE * SAMPLE_RATE));
  let at = 0;
  return {
    async until(seconds: number) {
      const stop = Math.min(end, Math.round(seconds * SAMPLE_RATE));
      while (at < stop) {
        const n = Math.min(4096, stop - at);
        const data = new Float32Array(n * 2);
        for (let c = 0; c < 2; c++) {
          const ch = sound[c]!;
          for (let i = 0; i < n; i++) {
            const pos = at + i;
            const left = end - pos;
            data[c * n + i] = ch[pos % len]! * (left < fadeLen ? left / fadeLen : 1);
          }
        }
        const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: SAMPLE_RATE, timestamp: at / SAMPLE_RATE });
        await source.add(sample);
        sample.close();
        at += n;
      }
    },
  };
}

export async function makeSlideshow(pictures: File[], opts: SlideshowOptions): Promise<AudioVideoResult> {
  if (pictures.length < 2) throw new InputError('Add at least two photos to make a slideshow.');
  if (pictures.length > MAX_PHOTOS) throw new InputError(`That is ${pictures.length} photos; the limit is ${MAX_PHOTOS}. Make two shorter slideshows and join them with Merge videos.`);
  let sound: Float32Array[] | null = null;
  if (opts.song) {
    const pcm = await decodePcm(opts.song);
    if (!pcm || pcm[0]!.length < SAMPLE_RATE * 0.1) throw new UnreadableFile('No sound could be read from the song. It may use a format this browser cannot decode.');
    sound = stereo(pcm);
  }
  for (const attempt of ATTEMPTS) {
    try {
      return await encode(pictures, sound, opts, scaledFrame(SHAPES[opts.shape], attempt.scale), attempt.video, attempt.audio);
    } catch (e) {
      if (!(e instanceof Error) || !ENCODER_REFUSAL.has(e.name)) throw e;
    }
  }
  throw new EncoderRefused();
}

async function encode(
  pictures: File[],
  sound: Float32Array[] | null,
  opts: SlideshowOptions,
  frame: { width: number; height: number },
  videoCodecs: VideoCodec[],
  audioCodecs: ('aac' | 'opus')[],
): Promise<AudioVideoResult> {
  const videoCodec = await pickVideoCodec({ ...frame, bitrate: QUALITY_HIGH }, videoCodecs);
  if (!videoCodec) throw new EncoderUnavailable('This browser cannot encode video. Try a recent version of Chrome, Edge or Safari.');
  const audioCodec = sound ? await firstEncodableSound(audioCodecs, { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: 192_000 }) : null;
  if (sound && !audioCodec) throw noAudioEncoder(false);

  const per = Math.min(10, Math.max(1, opts.secondsPer));
  const total = pictures.length * per;
  const fade = opts.crossfade ? Math.min(FADE_SECONDS, per / 2) : 0;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(videoSource);
  let audioSource: AudioSampleSource | null = null;
  if (sound && audioCodec) {
    audioSource = new AudioSampleSource({ codec: audioCodec, bitrate: 192_000 });
    output.addAudioTrack(audioSource);
  }
  const held: ImageBitmap[] = [];
  const release = () => held.splice(0).forEach((b) => b.close());
  try {
    await output.start();
    const feed = audioSource && sound ? songFeeder(audioSource, sound, total) : null;
    const canvas = new OffscreenCanvas(frame.width, frame.height);
    const ctx = canvas.getContext('2d')!;
    const add = async (t: number, d: number) => {
      // Never shorter than one tick of 60 fps: VP8 and VP9 encoders fail on a frame with no length.
      const sample = new VideoSample(canvas, { timestamp: t, duration: Math.max(d, 1 / 60) });
      await feed?.until(t);
      await videoSource.add(sample);
      sample.close();
    };
    await watchEncode(
      async (progress) => {
        const report = (f: number) => {
          progress(f);
          opts.onProgress?.(f);
        };
        let current = await frameOf(pictures[0]!, frame, opts);
        held.push(current);
        for (let i = 0; i < pictures.length; i++) {
          const last = i === pictures.length - 1;
          const start = i * per;
          const holdEnd = start + per - (last ? 0 : fade);
          ctx.globalAlpha = 1;
          ctx.drawImage(current, 0, 0);
          // One frame a second while a photo holds, so the file stays small and seeking is quick.
          for (let t = start; t < holdEnd - 1e-6; t += 1) {
            await add(t, Math.min(1, holdEnd - t));
            report(Math.min(0.99, t / total));
          }
          if (last) break;
          const next = await frameOf(pictures[i + 1]!, frame, opts);
          held.push(next);
          if (fade > 0) {
            const steps = Math.round(fade * FADE_FPS);
            for (let s = 0; s < steps; s++) {
              ctx.globalAlpha = 1;
              ctx.drawImage(current, 0, 0);
              ctx.globalAlpha = (s + 1) / (steps + 1);
              ctx.drawImage(next, 0, 0);
              await add(holdEnd + s * (fade / steps), fade / steps);
            }
            ctx.globalAlpha = 1;
          }
          current.close();
          held.splice(held.indexOf(current), 1);
          current = next;
          report(Math.min(0.99, ((i + 1) * per) / total));
        }
        await feed?.until(Infinity);
        videoSource.close();
        audioSource?.close();
        await output.finalize();
      },
      () => output.cancel(),
    );
  } catch (e) {
    release();
    await Promise.resolve(output.cancel()).catch(() => undefined);
    throw e;
  }
  release();
  const buffer = output.target.buffer;
  if (!buffer) throw new NamedError('SlideshowFailed', 'The video could not be written.');
  opts.onProgress?.(1);
  return { blob: new Blob([buffer], { type: 'video/mp4' }), ...frame, duration: total, videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec };
}
