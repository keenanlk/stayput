/**
 * Cut a part out of a video in the browser with Mediabunny (MPL-2.0). By
 * default the packets are copied, so the cut is instant and lossless; the
 * start then snaps to the nearest earlier key frame when one is within half a
 * second, and otherwise that part is re-encoded so the cut lands where asked.
 * "Exact" re-encodes the whole clip with the browser's WebCodecs encoder. Where
 * the browser cannot re-encode sound (iOS 18 and earlier), the sound's own
 * packets are copied, or, when the container cannot hold them, written as MP3.
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
  MPEG_TS,
  QTFF,
  QUALITY_HIGH,
  EncodedPacketSink,
  WEBM,
  WebMOutputFormat,
  AudioSampleSource,
  NON_PCM_AUDIO_CODECS,
  getFirstEncodableAudioCodec,
} from 'mediabunny';
import { executeWatched } from './encoder-watchdog';
import { EncoderRefused, encodeRun, requireH264Encoder } from './encoder-probe';
import { aacSafeSampleRate, codecsFor, planVideoCodec } from './video-codec';
import { unplayable } from './video-compress';
import { NamedError, UnreadableFile, UnsupportedCodec } from './input-error';
import { memoryRange, nameBare } from './bare-error';
import { isNotReadable, notReadable } from './read-failure';
import { pageRecoveryHooks } from './recovery-hooks';
import { adoptPlan, capScale, hardwareOption, retryOf, withRecovery, type Attempt, type RetryKind } from './edit-recovery';
import { firstEncodableSound, noAudioEncoder } from './mp3-fallback';
import { SAMPLE_RATE, decodePcm, pcmFeeder } from './pcm';

export interface TrimOptions {
  start: number;
  end: number;
  exact: boolean;
  mute: boolean;
  onProgress?: (fraction: number) => void;
  /** Said when the cut starts over after the page was hidden, or at a smaller size after the encoder gave up. */
  onNotice?: (message: string) => void;
}

export interface TrimResult {
  blob: Blob;
  ext: string;
  /** Seconds in the output. */
  duration: number;
  /** Set when the encoder failed and the part was copied from the key frame at or before its start instead. */
  keyframeCopy?: boolean;
  /** Set when the part was made on a retry, or at the smaller size that worked earlier in this tab. */
  retry?: RetryKind;
  /** The picture's size, when the cut re-encoded it. */
  width?: number;
  height?: number;
}

/** Names an encoder gives up with; a fast cut that meets one falls back to copying from the key frame. */
const ENCODER_FAILURES = new Set(['EncodingError', 'OperationError', 'InvalidStateError', 'NotSupportedError', 'EncoderStall', 'EncoderRefused', 'EncoderUnavailable', 'OutOfMemoryError']);

/**
 * Cuts the part. A failure that comes from the device and not the file (page hidden, encoder or memory gave up) gets one
 * more try (see edit-recovery.ts). Every failure leaves here with a name: NotReadableError for a file the phone could
 * not read, UnreadableFile or UnsupportedCodec for what the file is, CutFailed for any other plain error.
 */
export async function trimVideo(file: File, opts: TrimOptions): Promise<TrimResult> {
  const page = pageRecoveryHooks(opts.onNotice);
  let made = 0;
  try {
    return await withRecovery(
      async (attempt) => {
        const done = encodeRun(attempt);
        try {
          const r = await trimOnce(file, opts, attempt, (side) => (made = side));
          const retry = retryOf(attempt);
          return retry ? { ...r, retry } : r;
        } catch (e) {
          if (isNotReadable(e)) throw notReadable(e);
          e = memoryRange(e);
          // A fast cut re-encodes a part whose start is far from a key frame. When the encoder fails, copy from the key frame.
          const name = (e as { name?: string } | null)?.name ?? '';
          if (!opts.exact && !attempt.capped && ENCODER_FAILURES.has(name) && !page.hooks.wasHidden() && !page.hooks.reclaimed(e)) {
            try {
              return { ...(await trimOnce(file, opts, attempt, (side) => (made = side), true)), keyframeCopy: true };
            } catch (again) {
              throw isNotReadable(again) ? notReadable(again) : nameBare('CutFailed', memoryRange(again));
            }
          }
          throw nameBare('CutFailed', e);
        } finally {
          done();
        }
      },
      () => made,
      page.hooks,
    );
  } finally {
    page.dispose();
  }
}

async function trimOnce(file: File, opts: TrimOptions, attempt: Attempt, sized: (longestSide: number) => void, keyframes = false): Promise<TrimResult> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA, MPEG_TS] });
  try {
    const format = await input.getFormat().catch((e) => {
      if (isNotReadable(e)) throw notReadable(e);
      return null;
    });
    if (!format) throw new UnreadableFile('This file is not a video this page can read (MP4, MOV, WebM or MKV).');
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new UnreadableFile('This file has no video track.');
    if (opts.exact && !(await video.canDecode())) throw new UnsupportedCodec(unplayable());
    if (opts.exact) await requireH264Encoder();
    const outFormat =
      format === WEBM ? new WebMOutputFormat() : format === MATROSKA ? new MkvOutputFormat() : format === QTFF ? new MovOutputFormat({ fastStart: 'in-memory' }) : new Mp4OutputFormat({ fastStart: 'in-memory' });
    const output = new Output({ format: outFormat, target: new BufferTarget() });
    const sound = opts.mute ? null : await input.getPrimaryAudioTrack();
    const audioRate = opts.exact && !opts.mute ? await aacSafeSampleRate(sound) : undefined;
    // Sound the container holds and a browser encoder can write (PCM is not one: Mediabunny writes it without WebCodecs).
    const container = outFormat.getSupportedAudioCodecs();
    const encodable = container.filter((c) => (NON_PCM_AUDIO_CODECS as readonly string[]).includes(c));

    // Exact mode re-encodes the sound, which iOS 18 and earlier cannot (no AudioDecoder or AudioEncoder).
    // There the sound is kept another way: its packets copied as they are, or, when the container cannot
    // hold them, decoded by the page's own audio decoder and written as MP3 (MP4 and MKV only; a MOV holds AAC alone).
    let keepSound: 'copy' | 'mp3' | null = null;
    if (opts.exact && sound) {
      const canTranscode =
        (await sound.canDecode()) && !!(await getFirstEncodableAudioCodec(encodable, { numberOfChannels: Math.min(2, sound.numberOfChannels), sampleRate: 48_000, bitrate: QUALITY_HIGH }));
      if (!canTranscode && !(await getFirstEncodableAudioCodec(encodable, { numberOfChannels: 2, sampleRate: 48_000, bitrate: QUALITY_HIGH }))) {
        keepSound = sound.codec && container.includes(sound.codec) ? 'copy' : container.includes('mp3') && format !== QTFF ? 'mp3' : null;
        if (!keepSound) throw noAudioEncoder(true);
      }
    }
    let pcm: Float32Array[] | null = null;
    if (keepSound === 'mp3') {
      const all = await decodePcm(file);
      if (!all) throw noAudioEncoder(true);
      const from = Math.max(0, Math.round(opts.start * SAMPLE_RATE));
      const to = Math.round(opts.end * SAMPLE_RATE);
      pcm = all.map((ch) => ch.subarray(from, to));
      if (!(await firstEncodableSound([], { numberOfChannels: pcm.length, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH }))) throw noAudioEncoder(true);
    }

    const trim = { start: opts.start, end: opts.end };
    // A retry after the encoder gave up asks for a smaller picture than the first try's.
    const longest = Math.max(video.displayWidth, video.displayHeight);
    // A fast cut copies the picture, so a size remembered from an earlier failure does not apply to it; only a retry after its own failure does.
    let smaller = opts.exact || attempt.retry === 'smaller' ? capScale(attempt, longest) : 1;
    // A cut that re-encodes (exact, or a fast cut whose start is between key frames) is tested at the real size first, before the picture is read.
    // A fast cut only re-encodes when its start is more than the copy tolerance (0.5 s) past a key frame; otherwise no encoder is made at all.
    const key = opts.exact || smaller < 1 || keyframes ? null : await new EncodedPacketSink(video).getKeyPacket(opts.start, { metadataOnly: true }).catch(() => null);
    const needsEncoder = opts.exact || smaller < 1 || (!!key && opts.start - key.timestamp > 0.5);
    if (!keyframes && video.codec === 'avc' && needsEncoder) {
      const side = (n: number) => Math.max(2, 2 * Math.round((n * smaller) / 2));
      const plan = await planVideoCodec({ width: side(video.displayWidth), height: side(video.displayHeight), bitrate: QUALITY_HIGH }, codecsFor(attempt));
      if (!opts.exact && plan.maxSide) {
        // The encoder cannot write this picture at full size and a fast cut keeps it: copy from the key frame at once (no 60 s wait).
        throw new EncoderRefused();
      }
      if (opts.exact) smaller = Math.min(smaller, adoptPlan(attempt, plan, longest));
      else adoptPlan(attempt, { latencyMode: plan.latencyMode, hardwareAcceleration: plan.hardwareAcceleration }, longest);
    }
    const evenSide = (n: number) => Math.max(2, 2 * Math.round((n * smaller) / 2));
    sized(Math.round(longest * smaller));
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      trim,
      copy: keyframes ? { mode: 'forced' } : opts.exact || smaller < 1 ? false : { boundaryTolerance: 0.5 },
      // With the sound handled here, the output is started and finished here too.
      composable: !!keepSound,
      video: {
        ...(opts.exact ? { bitrate: QUALITY_HIGH, allowTransformationMetadata: false } : {}),
        ...hardwareOption(attempt),
        ...(smaller < 1 ? { width: evenSide(video.displayWidth), height: evenSide(video.displayHeight) } : {}),
      },
      audio: opts.mute || keepSound ? { discard: true } : opts.exact ? { bitrate: QUALITY_HIGH, sampleRate: audioRate } : {},
    });
    if (!conversion.isValid) {
      const reason = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
      throw reason === 'undecodable_source_codec' ? new UnsupportedCodec(unplayable()) : new NamedError('CutUnsupported', 'This browser cannot cut this video.');
    }
    if (keepSound) {
      let sink: Conversion | null = null;
      let source: AudioSampleSource | null = null;
      if (keepSound === 'copy') {
        sink = await Conversion.init({ input, output, tracks: 'primary', trim, copy: { mode: 'forced' }, composable: true, video: { discard: true }, audio: {} });
        if (!sink.isValid) throw noAudioEncoder(true);
      } else {
        source = new AudioSampleSource({ codec: 'mp3', bitrate: QUALITY_HIGH });
        output.addAudioTrack(source);
      }
      await output.start();
      const feeding = source ? pcmFeeder(source, pcm).until(Infinity).then(() => source!.close()) : null;
      await Promise.all([executeWatched(conversion, opts.onProgress), sink?.execute(), feeding]);
      await output.finalize();
    } else {
      await executeWatched(conversion, opts.onProgress);
    }
    const buffer = output.target.buffer;
    if (!buffer) throw new NamedError('OutputNotWritten', 'The video could not be written.');
    return {
      blob: new Blob([buffer], { type: outFormat.mimeType }),
      ext: outFormat.fileExtension.replace(/^\./, ''),
      duration: opts.end - opts.start,
      ...(smaller < 1 ? { width: evenSide(video.displayWidth), height: evenSide(video.displayHeight) } : {}),
    };
  } finally {
    input.dispose?.();
  }
}
