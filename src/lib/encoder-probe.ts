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
 */
import { CustomVideoEncoder, EncodedPacket, registerEncoder, type VideoCodec, type VideoSample } from 'mediabunny';

type Variant = { latencyMode: 'quality' | 'realtime'; baseline: boolean };

/** Tried in order; the first is what Mediabunny does on its own. */
const VARIANTS: Variant[] = [
  { latencyMode: 'quality', baseline: false },
  { latencyMode: 'realtime', baseline: false },
  { latencyMode: 'quality', baseline: true },
];

export const PROBE_MS = 2500;
const PROBE_FRAMES = 8;
/** What Mediabunny writes for H.264 when nothing else is said. */
const DEFAULT_CODEC = 'avc1.640016';

function configFor(v: Variant, base: VideoEncoderConfig): VideoEncoderConfig {
  const codec = v.baseline ? `avc1.4200${base.codec.slice(-2)}` : base.codec;
  return { ...base, codec, latencyMode: v.latencyMode };
}

/** Whether an encoder with this config hands back at least one packet and finishes, is silent, or is not offered at all. */
async function answers(config: VideoEncoderConfig, ms: number): Promise<'yes' | 'silent' | 'unsupported'> {
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
    for (let i = 0; i < PROBE_FRAMES; i++) {
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

/** Mediabunny's H.264 encoder, with the settings that were seen to answer. */
function encoderClass(variant: Variant) {
  return class extends CustomVideoEncoder {
    private native!: VideoEncoder;
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
      try {
        this.native.encode(frame, options);
      } finally {
        frame.close();
      }
    }
    flush() {
      return this.native.flush();
    }
    close() {
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
        if (variant !== VARIANTS[0]) registerEncoder(encoderClass(variant));
        return true;
      }
      if (result === 'silent') offered = true;
    }
    return !offered;
  })();
  return checked;
}

/** Shown when burned-in captions cannot be made here: says so plainly and links to the tool that still works. */
export class CaptionsUnavailable extends Error {
  /** A link the tool shell shows after the message. */
  readonly link = { href: '/video-to-subtitles', text: 'Make a subtitle file with Video to subtitles' };
  constructor() {
    super("Burned-in captions don't work in this browser yet, because its video encoder doesn't respond. Video to subtitles makes an SRT or WebVTT subtitle file from the same video, and that does work here.");
    // The kind a failed run records: the same one a stuck encoder already reports.
    this.name = 'EncoderStall';
  }
}
