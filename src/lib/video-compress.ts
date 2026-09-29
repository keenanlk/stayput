/**
 * Compress a video in the browser. Mediabunny (MPL-2.0) reads the container
 * (MP4, MOV, WebM, MKV), the browser's own WebCodecs decoders and encoders do
 * the pictures and sound, and Mediabunny writes a new MP4. H.264 with AAC is
 * preferred because every phone and site plays it; VP9 or AV1 with Opus are
 * the fallback where a browser lacks those encoders. Nothing leaves the tab.
 */
import {
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  QTFF,
  WEBM,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type Quality,
} from 'mediabunny';

export type CompressMode = 'balanced' | 'small' | 'high' | 'size';

export interface CompressOptions {
  mode: CompressMode;
  /** For mode 'size': the most the file may weigh, in megabytes (1,000,000 bytes). */
  targetMB?: number;
  /** Cap the short side of the picture (720 for 720p), or 0 to keep it. */
  maxShortSide: number;
  /** Drop the sound track. */
  mute: boolean;
  onProgress?: (fraction: number) => void;
}

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  videoCodec: string;
  /** Whether the output has sound. */
  audio: boolean;
  /** Set when the input had sound this browser could not re-encode, so it was left out. */
  audioDropped: boolean;
}

const QUALITY: Record<Exclude<CompressMode, 'size'>, Quality> = { small: QUALITY_LOW, balanced: QUALITY_MEDIUM, high: QUALITY_HIGH };
const CODEC_NAMES: Record<string, string> = { avc: 'H.264', vp9: 'VP9', av1: 'AV1', hevc: 'HEVC', aac: 'AAC', opus: 'Opus' };
/** Short sides tried, largest first, when a target size needs a smaller picture to look decent. */
const STEPS = [2160, 1440, 1080, 720, 540, 480, 360, 240];
/** Below roughly this many bits per pixel per frame, video turns to mush; drop the resolution instead. */
const MIN_BPP = 0.05;

const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

function unplayable(): string {
  return 'This browser cannot decode this video. iPhone videos are often HEVC (H.265), which Chrome and Firefox on Windows or Linux cannot read: try Safari, or set the iPhone camera to "Most Compatible".';
}

/** Width and height with the short side at most `short`, keeping the aspect ratio. */
function fit(w: number, h: number, short: number): { width: number; height: number } {
  const s = Math.min(w, h);
  const scale = short && s > short ? short / s : 1;
  return { width: even(w * scale), height: even(h * scale) };
}

export async function compressVideo(file: File, opts: CompressOptions): Promise<CompressResult> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new Error('This file has no video this page can read. It may be an audio file (try Video to MP3) or a format browsers do not open.');
    if (!(await video.canDecode())) throw new Error(unplayable());
    const sound = opts.mute ? null : await input.getPrimaryAudioTrack();
    const soundOk = sound ? await sound.canDecode() : false;
    const duration = await input.computeDuration();
    if (!(duration > 0)) throw new Error('This video has no length to compress.');
    const srcW = video.displayWidth;
    const srcH = video.displayHeight;

    let { width, height } = fit(srcW, srcH, opts.maxShortSide);
    let videoBitrate: number | Quality;
    let audioBitrate: number | Quality = 128_000;
    if (opts.mode === 'size') {
      const target = (opts.targetMB ?? 10) * 1e6;
      // Leave room for the container and for encoders that overshoot a little.
      const total = (target * 8 * 0.9) / duration;
      const audioBits = sound && soundOk ? (total > 1_500_000 ? 128_000 : total > 600_000 ? 96_000 : 64_000) : 0;
      const bits = Math.floor(total - audioBits);
      audioBitrate = audioBits;
      videoBitrate = bits;
      if (bits < 120_000) {
        const most = Math.floor((target * 8 * 0.9) / (184_000 * 60));
        throw new Error(`This video is too long to fit in ${opts.targetMB} MB and still be watchable. Trim it to under ${most} minute${most === 1 ? '' : 's'}, or choose a larger size.`);
      }
      // Pick the largest picture that the bitrate can fill with enough detail.
      const fps = 30;
      const short = STEPS.find((s) => s <= Math.min(srcW, srcH) && (!opts.maxShortSide || s <= opts.maxShortSide) && bits / (fit(srcW, srcH, s).width * fit(srcW, srcH, s).height * fps) >= MIN_BPP);
      ({ width, height } = fit(srcW, srcH, short ?? 240));
    } else {
      videoBitrate = QUALITY[opts.mode];
      audioBitrate = QUALITY[opts.mode];
    }

    const videoCodec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width, height, bitrate: videoBitrate });
    if (!videoCodec) throw new Error('This browser cannot encode video. Use a recent version of Chrome, Edge, Safari or Firefox.');
    const audioCodec =
      sound && soundOk
        ? await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: Math.min(2, sound.numberOfChannels), sampleRate: 48_000, bitrate: audioBitrate })
        : null;

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        width,
        height,
        fit: 'contain',
        codec: videoCodec,
        bitrate: videoBitrate,
        forceTranscode: true,
        // Bake a phone's rotation into the pixels so every player shows it upright.
        allowTransformationMetadata: false,
      },
      audio: audioCodec
        ? { codec: audioCodec, bitrate: audioBitrate, numberOfChannels: Math.min(2, sound!.numberOfChannels), forceTranscode: opts.mode === 'size' }
        : { discard: true },
    });
    if (!conversion.isValid) {
      const reason = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
      throw new Error(reason === 'undecodable_source_codec' ? unplayable() : 'This browser cannot convert this video.');
    }
    conversion.onProgress = (p) => opts.onProgress?.(p);
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The video could not be written.');
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      width,
      height,
      duration,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      audio: !!audioCodec,
      audioDropped: !!sound && !audioCodec,
    };
  } finally {
    input.dispose?.();
  }
}
