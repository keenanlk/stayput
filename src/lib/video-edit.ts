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
  WEBM,
  WebMOutputFormat,
  type Rotation,
} from 'mediabunny';
import { CODEC_NAMES, unplayable } from './video-compress';
import { pickVideoCodec } from './video-codec';

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
}

const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

/** Size of the picture as it is shown (rotation metadata applied), before any edit. */
export async function videoSize(file: File): Promise<{ width: number; height: number; duration: number }> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new Error('This file has no video this page can read (MP4, MOV, WebM or MKV).');
    return { width: video.displayWidth, height: video.displayHeight, duration: await input.computeDuration() };
  } finally {
    input.dispose?.();
  }
}

export async function editVideo(file: File, opts: EditOptions): Promise<EditResult> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const format = await input.getFormat().catch(() => null);
    if (!format) throw new Error('This file is not a video this page can read (MP4, MOV, WebM or MKV).');
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('This file has no video track.');
    const duration = await input.computeDuration();
    const sound = await input.getPrimaryAudioTrack();

    const quarter = opts.rotate === 90 || opts.rotate === 270;
    const turnedW = quarter ? video.displayHeight : video.displayWidth;
    const turnedH = quarter ? video.displayWidth : video.displayHeight;
    const reencode = !!(opts.rotate || opts.flip || opts.flipVertical || opts.crop || opts.width || opts.height);

    if (!reencode) {
      // Only the sound changes: copy the picture as it is, into the same kind of file.
      const outFormat =
        format === WEBM ? new WebMOutputFormat() : format === MATROSKA ? new MkvOutputFormat() : format === QTFF ? new MovOutputFormat({ fastStart: 'in-memory' }) : new Mp4OutputFormat({ fastStart: 'in-memory' });
      const output = new Output({ format: outFormat, target: new BufferTarget() });
      const conversion = await Conversion.init({ input, output, tracks: 'primary', video: {}, audio: opts.mute ? { discard: true } : {} });
      if (!conversion.isValid) throw new Error('This browser cannot rewrite this video.');
      conversion.onProgress = (p) => opts.onProgress?.(p);
      await conversion.execute();
      const buffer = output.target.buffer;
      if (!buffer) throw new Error('The video could not be written.');
      const kept = !opts.mute && !!sound && !conversion.discardedTracks.some((d) => d.track.isAudioTrack());
      return {
        blob: new Blob([buffer], { type: outFormat.mimeType }),
        ext: outFormat.fileExtension.replace(/^\./, ''),
        width: video.displayWidth,
        height: video.displayHeight,
        duration,
        videoCodec: CODEC_NAMES[video.codec ?? ''] ?? video.codec ?? 'video',
        reencoded: false,
        audio: kept,
        audioDropped: !opts.mute && !!sound && !kept,
      };
    }

    if (!(await video.canDecode())) throw new Error(unplayable());
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

    const videoCodec = await pickVideoCodec({ width, height, bitrate: QUALITY_HIGH });
    if (!videoCodec) throw new Error('This browser cannot encode video at this size. Try a smaller size, or a recent version of Chrome, Edge or Safari.');
    // Rotating 180 degrees then mirroring left to right is the same as mirroring top to bottom.
    let rotate = (opts.rotate ?? 0) as number;
    let flip = !!opts.flip;
    if (opts.flipVertical) {
      rotate = (rotate + 180) % 360;
      flip = !flip;
    }

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        codec: videoCodec,
        bitrate: QUALITY_HIGH,
        rotate: rotate as Rotation,
        flip,
        crop,
        width,
        height,
        fit: 'fill',
        forceTranscode: true,
        // Bake the rotation and flip into the pixels so every player shows the result the same way.
        allowTransformationMetadata: false,
      },
      audio: opts.mute ? { discard: true } : {},
    });
    if (!conversion.isValid) {
      const reason = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
      throw new Error(reason === 'undecodable_source_codec' ? unplayable() : 'This browser cannot edit this video.');
    }
    conversion.onProgress = (p) => opts.onProgress?.(p);
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The video could not be written.');
    const kept = !opts.mute && !!sound && !conversion.discardedTracks.some((d) => d.track.isAudioTrack());
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      ext: 'mp4',
      width,
      height,
      duration,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      reencoded: true,
      audio: kept,
      audioDropped: !opts.mute && !!sound && !kept,
    };
  } finally {
    input.dispose?.();
  }
}
