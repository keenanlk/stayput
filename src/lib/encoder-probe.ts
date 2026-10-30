/**
 * Finds out, before any slow work, whether this browser's H.264 encoder
 * answers. Some WebKit builds (Safari on the Mac among them) accept the
 * encoder settings Mediabunny asks for (High or Main profile, quality latency
 * mode) and then never return a single frame. A few tiny test frames show
 * this within a second or two. When the usual settings are silent, a variant
 * that does answer (real-time mode, or Baseline profile) is handed to
 * Mediabunny as its H.264 encoder; when none answers, the caller is told so it
 * can send the person to Video to subtitles instead of letting them wait.
 * The test frames are drawn here; no file is read.
 *
 * On WebKit the same encoder class also puts frames back in presentation
 * order before they are encoded. Safari's decoder can hand over the frames of
 * a video with B-frames (an iPhone H.264 .mov) slightly out of order, and an
 * encoder that is given a frame older than one it already took writes a file
 * whose timestamps run backwards, which Mediabunny's muxer refuses.
 */
import { EncoderStall } from './encoder-watchdog';
import { CustomVideoEncoder, EncodedPacket, registerEncoder, type VideoCodec, type VideoSample } from 'mediabunny';

type Variant = { latencyMode: 'quality' | 'realtime'; baseline: boolean };

/** Tried in order; the first is what Mediabunny does on its own. */
const VARIANTS: Variant[] = [
  { latencyMode: 'quality', baseline: false },
  { latencyMode: 'realtime', baseline: false },
  { latencyMode: 'quality', baseline: true },
];

export const PROBE_MS = 2500;
/** How many frames the encoder holds back to sort them; more than the few places H.264 B-frames can be out of order by. */
export const REORDER_FRAMES = 6;
const PROBE_FRAMES = 8;
/** What Mediabunny writes for H.264 when nothing else is said. */
const DEFAULT_CODEC = 'avc1.640016';

function configFor(v: Variant, base: VideoEncoderConfig): VideoEncoderConfig {
  const codec = v.baseline ? `avc1.4200${base.codec.slice(-2)}` : base.codec;
  // A run that asks for real-time latency (its Attempt, see edit-recovery.ts) gets it; the variant's own mode is the default.
  return { ...base, codec, latencyMode: base.latencyMode === 'realtime' || running?.latencyMode === 'realtime' ? 'realtime' : v.latencyMode };
}

/** The attempt whose encoder is being made right now. Set for the length of one run only, never left behind for the next. */
let registered = false;
let running: { latencyMode?: 'realtime' } | undefined;

/**
 * Mediabunny's Conversion passes a run's hardwareAcceleration to the encoder but drops latencyMode, so a Conversion-based run
 * (compress, edit, cut) tells this encoder its attempt's latency through here. Call it before the run and the returned function after.
 */
export function encodeRun(attempt: { latencyMode?: 'realtime' }): () => void {
  const before = running;
  running = attempt;
  return () => {
    running = before;
  };
}

/** Whether an encoder with this config hands back at least one packet and finishes, is silent, or is not offered at all. */
async function answers(config: VideoEncoderConfig, ms: number, frames = PROBE_FRAMES): Promise<'yes' | 'silent' | 'unsupported'> {
  let encoder: VideoEncoder | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!(await VideoEncoder.isConfigSupported(config)).supported) return 'unsupported';
    let packets = 0;
    let failed = false;
    encoder = new VideoEncoder({ output: () => packets++, error: () => (failed = true) });
    encoder.configure(config);
    const canvas = new OffscreenCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d')!;
    for (let i = 0; i < frames; i++) {
      ctx.fillStyle = `hsl(${i * 40}, 70%, 50%)`;
      ctx.fillRect(0, 0, config.width, config.height);
      const frame = new VideoFrame(canvas, { timestamp: i * 66_667 });
      encoder.encode(frame, { keyFrame: i === 0 });
      frame.close();
    }
    const silence = new Promise<'silent'>((resolve) => (timer = setTimeout(() => resolve('silent'), ms)));
    const result = await Promise.race([encoder.flush().then(() => 'flushed' as const), silence]);
    return result === 'flushed' && packets > 0 && !failed ? 'yes' : 'silent';
  } catch {
    return 'silent';
  } finally {
    clearTimeout(timer);
    try {
      encoder?.close();
    } catch {
      // Already closed.
    }
  }
}

/** The same test Mediabunny uses for "WebKit or a browser wrapping it" (Safari, and every browser on iOS). */
export const isWebKit = () => typeof navigator !== 'undefined' && /apple/i.test(navigator.vendor ?? '');

/** Mediabunny's H.264 encoder, with the settings that were seen to answer, taking frames in presentation order. */
function encoderClass(variant: Variant) {
  return class extends CustomVideoEncoder {
    private native!: VideoEncoder;
    /** Frames waiting to be sorted, oldest first. */
    private held: { frame: VideoFrame; options: VideoEncoderEncodeOptions }[] = [];
    private lastTimestamp = -Infinity;
    static override supports(codec: VideoCodec, config: VideoEncoderConfig): boolean {
      // Mediabunny offers a quantizer-rate config first; WebKit has none, and refusing it here makes Mediabunny move on to the bitrate one.
      return codec === 'avc' && typeof VideoEncoder !== 'undefined' && /^avc1\./.test(config.codec) && config.bitrateMode !== 'quantizer';
    }
    init() {
      this.native = new VideoEncoder({
        output: (chunk, meta) => this.onPacket(EncodedPacket.fromEncodedChunk(chunk), meta),
        error: (e) => this.onError(e),
      });
      this.native.configure(configFor(variant, this.config));
    }
    encode(sample: VideoSample, options: VideoEncoderEncodeOptions) {
      const frame = sample.toVideoFrame();
      let at = this.held.length;
      while (at > 0 && this.held[at - 1]!.frame.timestamp > frame.timestamp) at--;
      this.held.splice(at, 0, { frame, options });
      while (this.held.length > REORDER_FRAMES) this.send(this.held.shift()!);
    }
    /** Encodes one frame, unless an equal or later one already went in (the encoder cannot take it back). */
    private send({ frame, options }: { frame: VideoFrame; options: VideoEncoderEncodeOptions }) {
      try {
        if (frame.timestamp > this.lastTimestamp) {
          this.lastTimestamp = frame.timestamp;
          this.native.encode(frame, options);
        }
      } finally {
        frame.close();
      }
    }
    flush() {
      while (this.held.length) this.send(this.held.shift()!);
      return this.native.flush();
    }
    close() {
      for (const { frame } of this.held.splice(0)) frame.close();
      if (this.native.state !== 'closed') this.native.close();
    }
  };
}

let checked: Promise<boolean> | undefined;

/**
 * Resolves false only when the browser offers an H.264 encoder that never
 * answers, with every variant. When it answers (registering a working variant
 * if the default is silent), or offers none at all (the tools then fall back
 * to VP9 or AV1 themselves), it resolves true. Checked once per page.
 */
export function ensureH264Encoder(): Promise<boolean> {
  checked ??= (async () => {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined' || typeof OffscreenCanvas === 'undefined') return true;
    const base: VideoEncoderConfig = { codec: DEFAULT_CODEC, width: 320, height: 240, bitrate: 1_000_000, framerate: 15 };
    let offered = false;
    for (const variant of VARIANTS) {
      const result = await answers(configFor(variant, base), PROBE_MS);
      if (result === 'yes') {
        if ((variant !== VARIANTS[0] || isWebKit()) && !registered) {
          registered = true;
          registerEncoder(encoderClass(variant));
        }
        return true;
      }
      if (result === 'silent') offered = true;
    }
    return !offered;
  })();
  return checked;
}

/** Shown by the tools that re-encode video (other than burned-in captions) when this browser's H.264 encoder never answers. */
export class H264Unavailable extends EncoderStall {
  // The same plain message a stalled encode shows: suggests Chrome or Firefox, and Mute video.
  constructor() {
    super();
  }
}

/** Throws H264Unavailable (at once, before any slow work) when the browser's H.264 encoder is silent with every setting. */
export async function requireH264Encoder(): Promise<void> {
  if (!(await ensureH264Encoder())) throw new H264Unavailable();
  // The encoder that carries a run's real-time setting is Mediabunny's custom one (already in use on WebKit): make sure it is registered.
  if (running?.latencyMode === 'realtime' && !registered && typeof VideoEncoder !== 'undefined') {
    registered = true;
    registerEncoder(encoderClass(VARIANTS[0]!));
  }
}

/** Shown when burned-in captions cannot be made here: says so plainly and links to the tool that still works. */
export class CaptionsUnavailable extends Error {
  /** A link the tool shell shows after the message. */
  readonly link = { href: '/video-to-subtitles', text: 'Make a subtitle file with Video to subtitles' };
  constructor(message = "Burned-in captions don't work in this browser yet, because its video encoder doesn't respond. Video to subtitles makes an SRT or WebVTT subtitle file from the same video, and that does work here.") {
    super(message);
    // The kind a failed run records: the same one a stuck encoder already reports.
    this.name = 'EncoderStall';
  }
}

/**
 * Thrown where a tool that writes video finds the browser has no video encoder at all (WebCodecs'
 * VideoEncoder is missing, as in some Firefox builds), or none for the size asked. The name is the
 * short error kind a failed run records, so these no longer show up as a plain "Error".
 */
export class EncoderUnavailable extends Error {
  constructor(message = "This browser can't write video yet, so it can't make the new file. Use a recent Chrome, Edge or Safari.") {
    super(message);
    this.name = 'EncoderUnavailable';
  }
}

/**
 * Thrown when a browser's encoder said it could take the settings and then refused to start
 * (Chrome on Android: an OperationError, "Encoder creation error"), at every size and codec tried.
 * The name is the error kind a failed run records, so these split from a plain "Error" and from
 * a stalled encoder.
 */
export class EncoderRefused extends Error {
  constructor() {
    super("This device's video encoder refused to start, even at smaller sizes. Try a recent Chrome or Edge, or a computer.");
    this.name = 'EncoderRefused';
  }
}

/** Whether this browser says it can write H.264 in software, which a run retries with when the hardware encoder gave up. */
export async function softwareH264Offered(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const { supported, config } = await VideoEncoder.isConfigSupported({ codec: DEFAULT_CODEC, width: 640, height: 360, bitrate: 2_000_000, framerate: 30, hardwareAcceleration: 'prefer-software' });
    return !!supported && config?.hardwareAcceleration !== 'prefer-hardware';
  } catch {
    return false;
  }
}

/** Chrome, Edge and the other Chromium browsers (not WebKit, which Chrome on iOS is). */
export const isChromium = () => typeof navigator !== 'undefined' && !isWebKit() && /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);

const AVC_LEVELS: [maxMacroblocks: number, maxBitrate: number, level: number][] = [
  [99, 64_000, 0x0a], [396, 192_000, 0x0b], [396, 384_000, 0x0c], [396, 768_000, 0x0d], [396, 2_000_000, 0x14], [792, 4_000_000, 0x15],
  [1620, 4_000_000, 0x16], [1620, 10_000_000, 0x1e], [3600, 14_000_000, 0x1f], [5120, 20_000_000, 0x20], [8192, 20_000_000, 0x28],
  [8192, 50_000_000, 0x29], [8704, 50_000_000, 0x2a], [22080, 135_000_000, 0x32], [36864, 240_000_000, 0x33],
];

/** The H.264 codec string Mediabunny writes for a picture (High profile, level from the macroblock count and bitrate), so the probe asks for what the run will. */
export function avcCodecString(width: number, height: number, bitrate: number): string {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const level = (AVC_LEVELS.find(([mb, rate]) => macroblocks <= mb && bitrate <= rate) ?? AVC_LEVELS[AVC_LEVELS.length - 1]!)[2];
  return `avc1.6400${level.toString(16).padStart(2, '0')}`;
}

/** How long one probe may take and how many frames it encodes. */
export const SIZE_PROBE_MS = 2500;
export const SIZE_PROBE_FRAMES = 4;

const sizeProbes = new Map<string, Promise<boolean>>();

/**
 * Whether the H.264 encoder answers at this real picture size (4 frames, 2.5 s limit), with these settings. Cached per size and
 * settings for the page, so a refusal costs about a second once and repeats cost nothing. Resolves true when no test can be made.
 */
export function encodesAtSize(width: number, height: number, bitrate: number, rung: { latencyMode?: 'realtime'; hardwareAcceleration?: 'prefer-software' } = {}): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined' || typeof OffscreenCanvas === 'undefined') return Promise.resolve(true);
  // Test hook: a spec that breaks the encoder in the middle of a run (to test the retries) sets this so the test encode does not use up its failures.
  if ((globalThis as { __stayputNoSizeProbe?: boolean }).__stayputNoSizeProbe) return Promise.resolve(true);
  const key = `${width}x${height}|${rung.latencyMode ?? ''}|${rung.hardwareAcceleration ?? ''}`;
  let known = sizeProbes.get(key);
  if (!known) {
    const config: VideoEncoderConfig = { codec: avcCodecString(width, height, bitrate), width, height, bitrate, framerate: 30, ...rung };
    known = answers(config, SIZE_PROBE_MS, SIZE_PROBE_FRAMES).then((r) => r === 'yes');
    sizeProbes.set(key, known);
  }
  return known;
}

/**
 * The encoder setting a failed run is retried with at the same size: real-time latency on WebKit (its quality mode can go
 * silent), the software encoder on Chromium (the hardware encoder is what refuses on Android and Windows). Undefined elsewhere.
 */
export async function sameSizeRung(): Promise<{ latencyMode?: 'realtime'; hardwareAcceleration?: 'prefer-software' } | undefined> {
  if (isWebKit()) return { latencyMode: 'realtime' };
  if (isChromium() && (await softwareH264Offered())) return { hardwareAcceleration: 'prefer-software' };
  return undefined;
}

/** Whether the last rung (VP9 in the same MP4) is on offer: Chromium only, and only where its encoder takes VP9. */
export async function vp9Offered(): Promise<boolean> {
  if (!isChromium() || typeof VideoEncoder === 'undefined') return false;
  try {
    return !!(await VideoEncoder.isConfigSupported({ codec: 'vp09.00.10.08', width: 640, height: 360, bitrate: 2_000_000, framerate: 30 })).supported;
  } catch {
    return false;
  }
}

/** Whether this browser has a video encoder to ask. False means no tool that re-encodes can work here. */
export const hasVideoEncoder = () => typeof VideoEncoder !== 'undefined';
