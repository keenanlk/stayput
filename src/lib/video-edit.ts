/**
 * Simple video edits in the browser with Mediabunny (MPL-2.0): remove the
 * sound, resize, rotate, flip and crop. Removing the sound alone copies the
 * video packets untouched into a file of the same type, so it takes seconds
 * and loses nothing. Every other edit changes the pixels, so the picture is
 * decoded and re-encoded by the browser's own WebCodecs encoder into an MP4,
 * H.264 where available. Nothing leaves the tab.
 */
import {
  BlobSource,
  CanvasSource,
  BufferTarget,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  MkvOutputFormat,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  QTFF,
  QUALITY_HIGH,
  Quality,
  VideoSampleSink,
  WEBM,
  WebMOutputFormat,
  type InputVideoTrack,
  type Rotation,
} from 'mediabunny';
import { CODEC_NAMES, unplayable } from './video-compress';
import { executeWatched, watchEncode } from './encoder-watchdog';
import { EncoderUnavailable, hasVideoEncoder } from './encoder-probe';
import { pickVideoCodec } from './video-codec';
import { UnreadableFile } from './input-error';
import { openOpfsOutput } from './opfs-output';
import { matchedBitrate } from './output-bitrate';

export interface EditOptions {
  mute?: boolean;
  /** Clockwise, applied first. */
  rotate?: Rotation;
  /** Mirror left to right, after rotating. */
  flip?: boolean;
  /** Mirror top to bottom, after rotating. */
  flipVertical?: boolean;
  /** Region to keep, in pixels of the upright picture (after rotate and flip). */
  crop?: { left: number; top: number; width: number; height: number };
  /**
   * Paint over each frame after the other edits, for example to cover faces.
   * Gets the frame on a canvas and its time in seconds.
   */
  paint?: (ctx: CanvasRenderingContext2D, seconds: number) => void | Promise<void>;
  /**
   * Whether `paint` reads pixels back from the canvas (getImageData). Painters that only draw should say false:
   * a canvas kept for reading holds a copy of every frame in Safari until it is freed, which ran phones out of memory.
   */
  readsBack?: boolean;
  /**
   * Keep the output's bitrate near the source's (scaled for a smaller picture) when the default for "high" quality
   * would be above it. Without it a 4K phone clip came out 44% bigger than it went in.
   */
  matchSourceBitrate?: boolean;
  /**
   * Decode, paint and encode the picture in our own loop and let Mediabunny handle only the sound, instead of
   * giving it a per-frame `process` hook. For a phone clip stored sideways that skips its full-size rotate
   * re-render of every frame. Needs `paint`, and no rotate, flip or crop.
   */
  ownFrameLoop?: boolean;
  /** Output size. With only one side set, the other follows the aspect ratio. */
  width?: number;
  height?: number;
  onProgress?: (fraction: number) => void;
}

export interface EditResult {
  blob: Blob;
  ext: string;
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  /** Codec name of the picture in the output (H.264, VP9…). */
  videoCodec: string;
  /** False when the picture was copied without re-encoding. */
  reencoded: boolean;
  audio: boolean;
  /** Set when the input had sound this browser could not carry over. */
  audioDropped: boolean;
  /** For a painted edit: frames done, and milliseconds in `paint` and in all of the frame loop (page-local, never sent). */
  timing?: { frames: number; paintMs: number; loopMs: number };
}

/**
 * Where to write the output: a file on this device where the browser allows it (the tab then never holds the
 * whole video), otherwise a buffer in memory as before.
 */
async function outputTarget(inputBytes: number) {
  const disk = await openOpfsOutput(inputBytes);
  if (disk) return { target: disk.target, disk, buffer: undefined };
  const buffer = new BufferTarget();
  return { target: buffer, disk: undefined, buffer };
}

/** The finished output as a Blob: the file on disk, or the in-memory buffer. */
async function finishOutput(out: { disk?: Awaited<ReturnType<typeof openOpfsOutput>>; buffer?: BufferTarget }, type: string): Promise<Blob> {
  if (out.disk) return out.disk.finish(type);
  const buffer = out.buffer?.buffer;
  if (!buffer) throw new Error('The video could not be written.');
  return new Blob([buffer], { type });
}

/**
 * A turn of the event loop. A timer of 0 ms is held to 4 ms once nested, which at 3,500 frames is 14 s of waiting;
 * a message to ourselves gives the same turn at once.
 */
function nextTurn(): Promise<void> {
  const { port1, port2 } = new MessageChannel();
  return new Promise((done) => {
    port1.onmessage = () => {
      port1.close();
      done();
    };
    port2.postMessage(0);
  });
}

const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

/**
 * Size of the picture as it is shown, rotation applied. A file whose pixels are almost square
 * (an editor's scale step leaves a pixel aspect ratio such as 3075:3076 or 99:100) would otherwise
 * show as 1080x1921 and be written as 1080x1922, a size some encoders refuse or stall on; it is
 * taken at its coded size instead. Real non-square pixels (anamorphic, 4:3 and the like) are kept.
 */
export function shownSize(video: InputVideoTrack): { width: number; height: number } {
  const { num, den } = video.pixelAspectRatio;
  if (num > 0 && den > 0 && Math.abs(num / den - 1) < 0.015) {
    const turned = video.rotation % 180 !== 0;
    return turned ? { width: video.codedHeight, height: video.codedWidth } : { width: video.codedWidth, height: video.codedHeight };
  }
  return { width: video.displayWidth, height: video.displayHeight };
}

/** Size of the picture as it is shown (rotation metadata applied), before any edit. */
export async function videoSize(file: File): Promise<{ width: number; height: number; duration: number }> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new UnreadableFile('This file has no video this page can read (MP4, MOV, WebM or MKV).');
    return { ...shownSize(video), duration: await input.computeDuration() };
  } finally {
    input.dispose?.();
  }
}

export async function editVideo(file: File, opts: EditOptions): Promise<EditResult> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const format = await input.getFormat().catch(() => null);
    if (!format) throw new UnreadableFile('This file is not a video this page can read (MP4, MOV, WebM or MKV).');
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new UnreadableFile('This file has no video track.');
    const duration = await input.computeDuration();
    const sound = await input.getPrimaryAudioTrack();

    const quarter = opts.rotate === 90 || opts.rotate === 270;
    const shown = shownSize(video);
    const turnedW = quarter ? shown.height : shown.width;
    const turnedH = quarter ? shown.width : shown.height;
    const reencode = !!(opts.rotate || opts.flip || opts.flipVertical || opts.crop || opts.width || opts.height || opts.paint);

    if (!reencode) {
      // Only the sound changes: copy the picture as it is, into the same kind of file.
      const out = await outputTarget(file.size);
      // On disk the metadata is written after the pictures (the file is written out of order); in memory it goes in front.
      const fastStart = out.disk ? false : 'in-memory';
      const outFormat =
        format === WEBM ? new WebMOutputFormat() : format === MATROSKA ? new MkvOutputFormat() : format === QTFF ? new MovOutputFormat({ fastStart }) : new Mp4OutputFormat({ fastStart });
      let blob: Blob;
      let conversion: Conversion;
      try {
        const output = new Output({ format: outFormat, target: out.target });
        conversion = await Conversion.init({ input, output, tracks: 'primary', video: {}, audio: opts.mute ? { discard: true } : {} });
        if (!conversion.isValid) throw new Error('This browser cannot rewrite this video.');
        conversion.onProgress = (p) => opts.onProgress?.(p);
        await conversion.execute();
        blob = await finishOutput(out, outFormat.mimeType);
      } catch (e) {
        await out.disk?.abort();
        throw e;
      }
      const kept = !opts.mute && !!sound && !conversion.discardedTracks.some((d) => d.track.isAudioTrack());
      return {
        blob,
        ext: outFormat.fileExtension.replace(/^\./, ''),
        ...shown,
        duration,
        videoCodec: CODEC_NAMES[video.codec ?? ''] ?? video.codec ?? 'video',
        reencoded: false,
        audio: kept,
        audioDropped: !opts.mute && !!sound && !kept,
      };
    }

    if (!(await video.canDecode())) throw new UnreadableFile(unplayable());
    const crop = opts.crop
      ? {
          left: Math.max(0, Math.round(opts.crop.left)),
          top: Math.max(0, Math.round(opts.crop.top)),
          width: Math.max(2, Math.min(turnedW, Math.round(opts.crop.width))),
          height: Math.max(2, Math.min(turnedH, Math.round(opts.crop.height))),
        }
      : undefined;
    const baseW = crop?.width ?? turnedW;
    const baseH = crop?.height ?? turnedH;
    let width = baseW;
    let height = baseH;
    if (opts.width && opts.height) {
      width = opts.width;
      height = opts.height;
    } else if (opts.width) {
      width = opts.width;
      height = (opts.width * baseH) / baseW;
    } else if (opts.height) {
      height = opts.height;
      width = (opts.height * baseW) / baseH;
    }
    // Encoders want even sides; H.264 in most browsers also refuses odd ones.
    width = even(width);
    height = even(height);

    let bitrate: Quality = QUALITY_HIGH;
    if (opts.matchSourceBitrate && duration > 0) {
      const average = await video.getAverageBitrate().catch(() => null);
      const sourceBps = average && average > 0 ? average : (file.size * 8) / duration - (sound ? 128_000 : 0);
      const wanted = matchedBitrate(sourceBps, video.codec, shown.width * shown.height, width * height);
      if (wanted) bitrate = new Quality({ bitrate: wanted });
    }
    const videoCodec = await pickVideoCodec({ width, height, bitrate });
    if (!videoCodec) {
      throw hasVideoEncoder() ? new EncoderUnavailable('This browser cannot encode video at this size. Try a smaller size, or a recent version of Chrome, Edge or Safari.') : new EncoderUnavailable();
    }
    // Rotating 180 degrees then mirroring left to right is the same as mirroring top to bottom.
    let rotate = (opts.rotate ?? 0) as number;
    let flip = !!opts.flip;
    if (opts.flipVertical) {
      rotate = (rotate + 180) % 360;
      flip = !flip;
    }

    const paint = opts.paint;
    const timing = { frames: 0, paintMs: 0, loopMs: 0 };
    let loopStart = 0;
    // When the painter draws every frame at the output size anyway, the decoded frame is scaled there, once: asking
    // Mediabunny to resize first as well is a second full-size pass over every frame (it doubled the time per frame at 4K).
    const paintScales = !!paint && !rotate && !flip && !crop;
    let frame: CanvasRenderingContext2D | undefined;
    if (paint) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      frame = canvas.getContext('2d', { willReadFrequently: opts.readsBack !== false }) ?? undefined;
      if (!frame) throw new Error('Canvas is not available in this browser.');
    }
    if (opts.ownFrameLoop && paintScales && paint && frame) {
      const out = await outputTarget(file.size);
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: out.disk ? false : 'in-memory' }), target: out.target });
      let blob: Blob;
      let conversion: Conversion;
      try {
        const source = new CanvasSource(frame.canvas, { codec: videoCodec, bitrate });
        output.addVideoTrack(source, { frameRate: undefined });
        // Only the sound goes through the conversion; it is composable so the picture can be added beside it.
        conversion = await Conversion.init({ input, output, composable: true, tracks: 'primary', video: { discard: true }, audio: opts.mute ? { discard: true } : {} });
        if (!conversion.isValid && !conversion.discardedTracks.every((d) => d.track.isVideoTrack() || d.reason === 'discarded_by_user')) {
          throw new Error('This browser cannot edit this video.');
        }
        // Same zero point the conversion uses for the sound: the first timestamp of what it carries.
        const audioTrack = sound && !opts.mute && !conversion.discardedTracks.some((d) => d.track.isAudioTrack()) ? sound : null;
        const first = await (audioTrack ?? video).getFirstTimestamp();
        const zero = Math.max(first, 0);
        await output.start();
        let stopped = false;
        const loop = async (progress: (f: number) => void) => {
          const sink = new VideoSampleSink(video);
          let loopStart = 0;
          for await (const sample of sink.samples()) {
            if (stopped) {
              sample.close();
              break;
            }
            const at = sample.timestamp - zero;
            if (at < 0) {
              sample.close();
              continue;
            }
            sample.draw(frame!, 0, 0, width, height);
            const length = sample.duration;
            sample.close();
            const began = performance.now();
            if (!loopStart) loopStart = began;
            await paint(frame!, at);
            timing.paintMs += performance.now() - began;
            await nextTurn();
            await source.add(at, length);
            timing.frames++;
            timing.loopMs = performance.now() - loopStart;
            const f = duration > 0 ? Math.min(1, at / duration) : 0;
            progress(f);
            opts.onProgress?.(f);
          }
          source.close();
        };
        await watchEncode(
          async (progress) => {
            // With no sound track there is nothing for the conversion to do.
            const audioDone = conversion.isValid ? conversion.execute() : Promise.resolve();
            audioDone.catch(() => undefined);
            await Promise.all([loop(progress), audioDone]);
            await output.finalize();
          },
          async () => {
            stopped = true;
            await conversion.cancel().catch(() => undefined);
            await output.cancel().catch(() => undefined);
          },
        );
        opts.onProgress?.(1);
        blob = await finishOutput(out, 'video/mp4');
      } catch (e) {
        await out.disk?.abort();
        throw e;
      }
      const kept = !opts.mute && !!sound && !conversion.discardedTracks.some((d) => d.track.isAudioTrack());
      return {
        blob,
        ext: 'mp4',
        width,
        height,
        duration,
        videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
        reencoded: true,
        audio: kept,
        audioDropped: !opts.mute && !!sound && !kept,
        timing,
      };
    }
    const out = await outputTarget(file.size);
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: out.disk ? false : 'in-memory' }), target: out.target });
    let blob: Blob;
    let conversion: Conversion;
    try {
      conversion = await Conversion.init({
        input,
        output,
        tracks: 'primary',
        video: {
          codec: videoCodec,
          bitrate,
          rotate: rotate as Rotation,
          flip,
          crop,
          ...(paintScales ? { processedWidth: width, processedHeight: height } : { width, height, fit: 'fill' as const }),
          forceTranscode: true,
          // Bake the rotation and flip into the pixels so every player shows the result the same way.
          allowTransformationMetadata: false,
          process:
            paint && frame
              ? async (sample) => {
                  sample.draw(frame!, 0, 0, width, height);
                  const at = sample.timestamp;
                  // Let go of the decoded frame now, and give the browser a turn between frames: without
                  // it the frames pile up faster than they are freed (about 10 MB per second of 1080p video in Safari).
                  sample.close();
                  const began = performance.now();
                  if (!loopStart) loopStart = began;
                  await paint(frame!, at);
                  timing.paintMs += performance.now() - began;
                  await nextTurn();
                  timing.frames++;
                  timing.loopMs = performance.now() - loopStart;
                  return frame!.canvas;
                }
              : undefined,
        },
        audio: opts.mute ? { discard: true } : {},
      });
      if (!conversion.isValid) {
        const reason = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
        throw reason === 'undecodable_source_codec' ? new UnreadableFile(unplayable()) : new Error('This browser cannot edit this video.');
      }
      await executeWatched(conversion, opts.onProgress);
      blob = await finishOutput(out, 'video/mp4');
    } catch (e) {
      await out.disk?.abort();
      throw e;
    }
    const kept = !opts.mute && !!sound && !conversion.discardedTracks.some((d) => d.track.isAudioTrack());
    return {
      blob,
      ext: 'mp4',
      width,
      height,
      duration,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      reencoded: true,
      audio: kept,
      audioDropped: !opts.mute && !!sound && !kept,
      timing: paint ? timing : undefined,
    };
  } finally {
    input.dispose?.();
  }
}
