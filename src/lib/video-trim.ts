/**
 * Cut a part out of a video in the browser with Mediabunny (MPL-2.0). By
 * default the packets are copied, so the cut is instant and lossless; the
 * start then snaps to the nearest earlier key frame when one is within half a
 * second, and otherwise that part is re-encoded so the cut lands where asked.
 * "Exact" re-encodes the whole clip with the browser's WebCodecs encoder.
 * The output keeps the input's container (MP4, MOV, WebM or MKV).
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
} from 'mediabunny';
import { unplayable } from './video-compress';

export interface TrimOptions {
  start: number;
  end: number;
  exact: boolean;
  mute: boolean;
  onProgress?: (fraction: number) => void;
}

export interface TrimResult {
  blob: Blob;
  ext: string;
  /** Seconds in the output. */
  duration: number;
}

export async function trimVideo(file: File, opts: TrimOptions): Promise<TrimResult> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const format = await input.getFormat().catch(() => null);
    if (!format) throw new Error('This file is not a video this page can read (MP4, MOV, WebM or MKV).');
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('This file has no video track.');
    if (opts.exact && !(await video.canDecode())) throw new Error(unplayable());
    const outFormat =
      format === WEBM ? new WebMOutputFormat() : format === MATROSKA ? new MkvOutputFormat() : format === QTFF ? new MovOutputFormat({ fastStart: 'in-memory' }) : new Mp4OutputFormat({ fastStart: 'in-memory' });
    const output = new Output({ format: outFormat, target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      trim: { start: opts.start, end: opts.end },
      copy: opts.exact ? false : { boundaryTolerance: 0.5 },
      video: opts.exact ? { bitrate: QUALITY_HIGH, allowTransformationMetadata: false } : {},
      audio: opts.mute ? { discard: true } : opts.exact ? { bitrate: QUALITY_HIGH } : {},
    });
    if (!conversion.isValid) {
      const reason = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
      throw new Error(reason === 'undecodable_source_codec' ? unplayable() : 'This browser cannot cut this video.');
    }
    conversion.onProgress = (p) => opts.onProgress?.(p);
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The video could not be written.');
    return { blob: new Blob([buffer], { type: outFormat.mimeType }), ext: outFormat.fileExtension.replace(/^\./, ''), duration: opts.end - opts.start };
  } finally {
    input.dispose?.();
  }
}
