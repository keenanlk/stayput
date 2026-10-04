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
  QTFF,
  QUALITY_HIGH,
  VideoSampleSink,
  VideoSampleSource,
  WEBM,
  getFirstEncodableAudioCodec,
} from 'mediabunny';
import { CODEC_NAMES, unplayable } from './video-compress';
import { watchEncode } from './encoder-watchdog';
import { pickVideoCodec } from './video-codec';
import { timeStretch } from './stretch';
import { SAMPLE_RATE, decodePcm, pcmFeeder } from './pcm';

export interface SpeedOptions {
  /** 2 plays twice as fast, 0.5 at half speed. */
  speed: number;
  mute: boolean;
  onProgress?: (fraction: number) => void;
}

export interface SpeedResult {
  blob: Blob;
  width: number;
  height: number;
  /** Seconds, after the change. */
  duration: number;
  videoCodec: string;
  audio: boolean;
}

const MAX_FPS = 60;

export async function changeSpeed(file: File, opts: SpeedOptions): Promise<SpeedResult> {
  const speed = opts.speed;
  if (!(speed >= 0.1 && speed <= 16)) throw new Error('Choose a speed between 0.1× and 16×.');
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new Error('This file has no video this page can read (MP4, MOV, WebM or MKV).');
    if (!(await video.canDecode())) throw new Error(unplayable());
    const duration = await input.computeDuration();
    const width = video.codedWidth;
    const height = video.codedHeight;
    const videoCodec = await pickVideoCodec({ width: width + (width % 2), height: height + (height % 2), bitrate: QUALITY_HIGH });
    if (!videoCodec) throw new Error('This browser cannot encode video. Use a recent version of Chrome, Edge, Safari or Firefox.');

    // The sound, stretched to the new length at the same pitch.
    let sound: Float32Array[] | null = null;
    if (!opts.mute && (await input.getPrimaryAudioTrack())) {
      const decoded = await decodePcm(file);
      if (decoded) sound = timeStretch(decoded, speed);
    }
    const audioCodec = sound
      ? await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: sound.length, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH })
      : null;

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH, sizeChangeBehavior: 'contain' });
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
          await videoSource.add(sample);
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
    if (!buffer) throw new Error('The video could not be written.');
    opts.onProgress?.(1);
    const quarter = video.rotation === 90 || video.rotation === 270;
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      width: quarter ? height : width,
      height: quarter ? width : height,
      duration: Math.max(end, soundLen / SAMPLE_RATE) || duration / speed,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      audio: !!audioSource,
    };
  } finally {
    input.dispose?.();
  }
}
