/**
 * Speed a video up or slow it down in the browser. Mediabunny (MPL-2.0)
 * decodes the frames and each one is given a new time; speeding up drops
 * frames beyond 60 per second so the file does not balloon. The sound is
 * decoded by the browser, stretched to the new length without changing its
 * pitch (see stretch.ts), and both are encoded again into an MP4 (H.264 and
 * AAC where the browser has them). Nothing leaves the tab.
 */
import {
  AudioSampleSource,
  BlobSource,
  BufferTarget,
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
} from 'mediabunny';
import { CODEC_NAMES, unplayable } from './video-compress';
import { watchEncode } from './encoder-watchdog';
import { codecsFor, planVideoCodec } from './video-codec';
import { adoptPlan, capScale, encodeOptions, type Attempt, type RetryKind } from './edit-recovery';
import { runRecovered } from './video-run';
import { timeStretch } from './stretch';
import { SAMPLE_RATE, decodePcm, pcmFeeder } from './pcm';
import { firstEncodableSound, noAudioEncoder } from './mp3-fallback';
import { InputError, UnsupportedCodec, UnreadableFile, NamedError } from './input-error';

export interface SpeedOptions {
  /** 2 plays twice as fast, 0.5 at half speed. */
  speed: number;
  mute: boolean;
  onProgress?: (fraction: number) => void;
  /** Said when the run starts again after the page was hidden, or at a smaller size after the encoder gave up. */
  onNotice?: (message: string) => void;
}

export interface SpeedResult {
  blob: Blob;
  width: number;
  height: number;
  /** Seconds, after the change. */
  duration: number;
  videoCodec: string;
  audio: boolean;
  /** Set when the file was made on a retry after the encoder gave up or the page was hidden, or at the smaller size that worked earlier in this tab. */
  retry?: RetryKind;
}

const MAX_FPS = 60;
const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

export async function changeSpeed(file: File, opts: SpeedOptions): Promise<SpeedResult> {
  const speed = opts.speed;
  if (!(speed >= 0.1 && speed <= 16)) throw new InputError('Choose a speed between 0.1× and 16×.');
  return runRecovered('VideoSpeedFailed', opts.onNotice, (attempt, sized) => speedOnce(file, opts, attempt, sized));
}

async function speedOnce(file: File, opts: SpeedOptions, attempt: Attempt, sized: (longestSide: number) => void): Promise<SpeedResult> {
  const speed = opts.speed;
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA, MPEG_TS] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new UnreadableFile('This file has no video this page can read (MP4, MOV, WebM or MKV).');
    if (!(await video.canDecode())) throw new UnsupportedCodec(unplayable());
    const duration = await input.computeDuration();
    const width = video.codedWidth;
    const height = video.codedHeight;
    // A retry after the encoder gave up asks for a smaller picture than the first try's; the test encode at the real size can lower it further.
    const longest = Math.max(width, height);
    const wanted = capScale(attempt, longest);
    const plan = await planVideoCodec({ width: even(width * wanted), height: even(height * wanted), bitrate: QUALITY_HIGH }, codecsFor(attempt));
    const k = adoptPlan(attempt, plan, longest);
    const outW = k < 1 ? even(width * k) : width;
    const outH = k < 1 ? even(height * k) : height;
    sized(Math.max(outW, outH));
    const videoCodec = plan.codec;
    if (!videoCodec) throw new NamedError('VideoSpeedFailed', 'This browser cannot encode video. Use a recent version of Chrome, Edge, Safari or Firefox.');

    // The sound, stretched to the new length at the same pitch.
    let sound: Float32Array[] | null = null;
    if (!opts.mute && (await input.getPrimaryAudioTrack())) {
      const decoded = await decodePcm(file);
      if (decoded) sound = timeStretch(decoded, speed);
    }
    // iOS 18 and earlier have no AudioEncoder: MP3 (encoded in WebAssembly) is the sound an MP4 can then hold.
    const audioCodec = sound
      ? await firstEncodableSound(['aac', 'opus'], { numberOfChannels: sound.length, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH })
      : null;
    if (sound && !audioCodec) throw noAudioEncoder(true);

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, sizeChangeBehavior: 'contain', ...encodeOptions(attempt) });
    output.addVideoTrack(videoSource, { rotation: video.rotation, frameRate: MAX_FPS });
    const audioSource = audioCodec ? new AudioSampleSource({ codec: audioCodec, bitrate: QUALITY_HIGH }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    // Sound goes in alongside the pictures, so the file is written in order.
    const feed = pcmFeeder(audioSource, sound);
    const soundLen = feed.length;
    const pushSoundUntil = (seconds: number) => feed.until(seconds);

    let end = 0;
    await watchEncode(
      async (progress) => {
        const report = (f: number) => {
          progress(f);
          opts.onProgress?.(f);
        };
        const sink = new VideoSampleSink(video);
        const start = await video.getFirstTimestamp();
        // At a smaller size every picture is drawn onto a canvas of that size first.
        const canvas = k < 1 ? new OffscreenCanvas(outW, outH) : null;
        const ctx = canvas?.getContext('2d') ?? null;
        let lastKept = -Infinity;
        for await (const sample of sink.samples()) {
          const t = (sample.timestamp - start) / speed;
          const d = sample.duration / speed;
          // Faster than 60 frames a second only makes the file bigger; drop the extra frames.
          if (t < lastKept + 1 / MAX_FPS - 1e-4) {
            sample.close();
            continue;
          }
          lastKept = t;
          sample.setTimestamp(t);
          sample.setDuration(d);
          sample.setRotation(0);
          await pushSoundUntil(t);
          if (canvas && ctx) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, outW, outH);
            sample.drawWithFit(ctx, { fit: 'contain' });
            const frame = new VideoSample(canvas, { timestamp: t, duration: d });
            await videoSource.add(frame);
            frame.close();
          } else {
            await videoSource.add(sample);
          }
          end = Math.max(end, t + d);
          sample.close();
          report(Math.min(0.99, t / Math.max(0.001, duration / speed)));
        }
        await pushSoundUntil(Infinity);
        videoSource.close();
        audioSource?.close();
        await output.finalize();
      },
      () => output.cancel(),
    );
    const buffer = output.target.buffer;
    if (!buffer) throw new NamedError('VideoSpeedFailed', 'The video could not be written.');
    opts.onProgress?.(1);
    const quarter = video.rotation === 90 || video.rotation === 270;
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      width: quarter ? outH : outW,
      height: quarter ? outW : outH,
      duration: Math.max(end, soundLen / SAMPLE_RATE) || duration / speed,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      audio: !!audioSource,
    };
  } finally {
    input.dispose?.();
  }
}
