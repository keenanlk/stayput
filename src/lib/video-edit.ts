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
  MPEG_TS,
  QTFF,
  QUALITY_HIGH,
  Quality,
  WEBM,
  WebMOutputFormat,
  type InputVideoTrack,
  type Rotation,
} from 'mediabunny';
import { CODEC_NAMES, unplayable } from './video-compress';
import { executeWatched } from './encoder-watchdog';
import { EncoderUnavailable, encodeRun, hasVideoEncoder } from './encoder-probe';
import { codecsFor, planVideoCodec } from './video-codec';
import { UnsupportedCodec, NamedError } from './input-error';
import { probeDecode } from './decode-probe';
import { isNotReadable, notReadable, retryUnreadable } from './read-failure';
import { nameBare } from './bare-error';
import { openOpfsOutput } from './opfs-output';
import { matchedBitrate } from './output-bitrate';
import { capAtRisk, pageRecoveryHooks } from './recovery-hooks';
import { codecFailure, guardCodecs, isReclaim, tagCodec } from './codec-guard';
import { releaseConversion } from './conversion-release';
import { context2d, releaseCanvas } from './canvas-memory';
import { adoptPlan, capScale, hardwareOption, isShrinkable, retryOf, withRecovery, type Attempt, type RetryKind } from './edit-recovery';

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
  /** Output size. With only one side set, the other follows the aspect ratio. */
  width?: number;
  height?: number;
  onProgress?: (fraction: number) => void;
  /**
   * Start a phone at a smaller size when the source is 4K, or after the browser closed the page in an earlier run (see capAtRisk).
   * Only the caption redraw asks: it holds a canvas and a speech model's leftovers, which is what ran phones out of memory.
   */
  capFirstTry?: boolean;
  /** Said when the job starts over after the page was hidden, or at a smaller size after the encoder gave up. */
  onNotice?: (message: string) => void;
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
  /** Set when the first try failed and this is the second: after the page was hidden, or at a smaller size. */
  retry?: RetryKind;
}

/**
 * Where to write the output: a file on this device where the browser allows it (the tab then never holds the
 * whole video), otherwise a buffer in memory as before.
 */
/** An error with its own class name, so a failed run records which step it was (never the message). */
const failure = (name: string, message: string) => Object.assign(new NamedError('VideoEditFailed', message), { name });

/** A file the phone could not read is not "not a video": it keeps its own name, so the job can read it once more. */
function readOrNull(e: unknown): null {
  if (isNotReadable(e)) throw notReadable(e);
  return null;
}

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
  if (!buffer) throw failure('OutputNotWritten', 'The video could not be written.');
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

/** About how many frames a video has (duration times the frame rate from its first packets); undefined when it cannot be told. */
export async function frameEstimate(file: File): Promise<number | undefined> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA, MPEG_TS] });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) return undefined;
    const [duration, stats] = await Promise.all([input.computeDuration(), video.computePacketStats(120).catch(() => null)]);
    const rate = stats?.averagePacketRate;
    return rate && rate > 0 && duration > 0 ? Math.max(1, Math.round(duration * rate)) : undefined;
  } catch {
    return undefined;
  } finally {
    input.dispose?.();
  }
}

/** Size of the picture as it is shown (rotation metadata applied), before any edit. */
export async function videoSize(file: File): Promise<{ width: number; height: number; duration: number }> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA, MPEG_TS] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(readOrNull);
    if (!video) throw new NamedError('NoVideoTrack', 'This file has no video this page can read (MP4, MOV, WebM or MKV).');
    try {
      return { ...shownSize(video), duration: await input.computeDuration() };
    } catch (e) {
      // A plain TypeError here (a browser quirk while reading the picture's size) is named for this step.
      throw isNotReadable(e) ? notReadable(e) : nameBare('VideoSizeReadFailed', e);
    }
  } finally {
    input.dispose?.();
  }
}

/**
 * Fails now, with the same message the run would end with, when this browser cannot decode the video: so a tool can say
 * so before it downloads a model. Anything else is left for the run to report.
 */
export async function assertReadable(file: File): Promise<void> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA, MPEG_TS] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(readOrNull);
    if (!video) return;
    if (!(await video.canDecode().catch(() => true))) throw new UnsupportedCodec(unplayable());
    // canDecode only asks whether the codec is supported; a few pictures are decoded for real (DecodeFailed if they are not).
    await probeDecode(video, await input.computeDuration().catch(() => 0));
  } finally {
    input.dispose?.();
  }
}

/**
 * Edit a video. A phone that took its codecs back while the page was hidden, or whose encoder gave up (or ran out of
 * memory) at full size, gets one more try (see edit-recovery.ts) before the failure is shown.
 */
export async function editVideo(file: File, opts: EditOptions): Promise<EditResult> {
  if (!opts.paint && !opts.rotate && !opts.flip && !opts.flipVertical && !opts.crop && !opts.width && !opts.height) {
    // Remove sound: the picture is copied, with nothing to retry. A failure with no name of its own is named for this step.
    try {
      return await editVideoOnce(file, opts, {});
    } catch (e) {
      throw nameBare('VideoCopyFailed', e);
    }
  }
  const page = pageRecoveryHooks(opts.onNotice);
  let made = 0;
  try {
    // A file the phone could not read is read once more; a failure that arrives with no name of its own is named for this step.
    return await retryUnreadable(
      file,
      () =>
        withRecovery(
          async (attempt) => {
            const done = encodeRun(attempt);
            try {
              const r = await editVideoOnce(file, opts, attempt, (side) => (made = side));
              const retry = retryOf(attempt);
              return retry ? { ...r, retry } : r;
            } finally {
              done();
            }
          },
          () => made,
          page.hooks,
        ),
      opts.onNotice,
    );
  } catch (e) {
    // A codec, person finder or canvas the browser invalidated under the run (InvalidStateError, or a reclaim), still failing after
    // the recovery inside the run and the retries above: name the object it was (see codec-guard.ts), say what to do.
    const invalid = codecFailure(e);
    if (invalid) throw invalid;
    throw nameBare('VideoEditFailed', e);
  } finally {
    page.dispose();
  }
}

/**
 * A decoder's EncodingError has the same name as an encoder's, and a smaller picture does not fix a decoder. So when a run ends in one,
 * the picture is decoded again where the run stopped: if that fails it was the decoder (DecodeFailed, not retried), otherwise the
 * encoder, and the error is returned as it came.
 */
async function decoderOrEncoder(e: unknown, video: InputVideoTrack, duration: number, at: number): Promise<unknown> {
  const name = (e as { name?: string } | null)?.name;
  if (name !== 'EncodingError' && name !== 'OperationError') return e;
  // A hidden page or a reclaimed codec fails a decoder too; the recovery that waits for the page handles those.
  if (document.hidden || isReclaim(e)) return e;
  return probeDecode(video, duration, at > 0 ? at : undefined).then(
    () => e,
    (failed) => failed,
  );
}

async function editVideoOnce(file: File, opts: EditOptions, attempt: Attempt, sized?: (longestSide: number) => void): Promise<EditResult> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA, MPEG_TS] });
  try {
    const format = await input.getFormat().catch(readOrNull);
    if (!format) throw new NamedError('UnreadableContainer', 'This file is not a video this page can read (MP4, MOV, WebM or MKV).');
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new NamedError('NoVideoTrack', 'This file has no video track.');
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
        if (!conversion.isValid) throw failure('ConversionInvalid', 'This browser cannot rewrite this video.');
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

    if (!(await video.canDecode())) throw new UnsupportedCodec(unplayable());
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
    // A retry after the encoder gave up asks for a smaller picture than the first try's.
    const longest = Math.max(width, height);
    if (opts.capFirstTry) capAtRisk(attempt, Math.max(shown.width, shown.height), true);
    const capK = capScale(attempt, longest);
    // Bitrate first, then the test encode at the real size below can lower the size before the file is decoded.

    let bitrate: Quality = QUALITY_HIGH;
    if (opts.matchSourceBitrate && duration > 0) {
      const average = await video.getAverageBitrate().catch(() => null);
      const sourceBps = average && average > 0 ? average : (file.size * 8) / duration - (sound ? 128_000 : 0);
      const wanted = matchedBitrate(sourceBps, video.codec, shown.width * shown.height, width * capK * (height * capK));
      if (wanted) bitrate = new Quality({ bitrate: wanted });
    }
    const plan = await planVideoCodec({ width: even(width * capK), height: even(height * capK), bitrate }, codecsFor(attempt));
    const k = adoptPlan(attempt, plan, longest);
    width = even(width * k);
    height = even(height * k);
    sized?.(Math.max(width, height));
    const videoCodec = plan.codec;
    if (!videoCodec) {
      // With an encoder present, only this size is refused (iOS Safari at 4K): a smaller picture can get past it (edit-recovery.ts).
      throw hasVideoEncoder()
        ? Object.assign(new EncoderUnavailable('This browser cannot encode video at this size. Try a smaller size, or a recent version of Chrome, Edge or Safari.'), { sizeRefused: true })
        : new EncoderUnavailable();
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
      frame = context2d(canvas, { willReadFrequently: opts.readsBack !== false });
    }
    const out = await outputTarget(file.size);
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: out.disk ? false : 'in-memory' }), target: out.target });
    let blob: Blob;
    let conversion: Conversion | undefined;
    let processedTime = 0;
    // A decoder or encoder the browser takes back part-way is replaced and the run goes on; whatever is left open at the end is closed.
    const unguard = guardCodecs();
    try {
      conversion = await Conversion.init({
        input,
        output,
        tracks: 'primary',
        video: {
          codec: videoCodec,
          bitrate,
          ...hardwareOption(attempt),
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
                  try {
                    sample.draw(frame!, 0, 0, width, height);
                  } catch (e) {
                    throw isReclaim(e) ? tagCodec(e, 'canvas', 'draw') : e;
                  }
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
        throw reason === 'undecodable_source_codec' ? new UnsupportedCodec(unplayable()) : failure('EditUnsupported', 'This browser cannot edit this video.');
      }
      await executeWatched(conversion, (p, t) => {
        processedTime = t;
        opts.onProgress?.(p);
      });
      blob = await finishOutput(out, 'video/mp4');
    } catch (e) {
      await out.disk?.abort();
      // Mediabunny cancels without waiting; let the failed try's decoder and encoder go before anything opens another.
      await releaseConversion(conversion, isShrinkable(e));
      throw await decoderOrEncoder(e, video, duration, processedTime);
    } finally {
      unguard();
      releaseCanvas(frame?.canvas);
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
