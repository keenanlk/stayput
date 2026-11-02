/**
 * Sound for an MP4 on browsers that cannot encode it: iOS 18 and earlier have
 * no AudioEncoder in any browser (Safari, Chrome and the rest all run on
 * WebKit there). The LAME encoder the audio tools already use (wasm-media-encoders,
 * LGPL, served from /vendor/) is registered with Mediabunny as an MP3 encoder,
 * and MP4 carries MP3 sound that iPhones play.
 */
import { CustomAudioEncoder, EncodedPacket, getFirstEncodableAudioCodec, registerEncoder, type AudioCodec, type AudioSample, type Quality } from 'mediabunny';
import { vendorDir, wantVendor } from './vendor';
import { splitMp3Frames } from './mp3-frames';
import { NamedError } from './input-error';

// Any page that loads this can write MP3, so it must work offline after one visit.
wantVendor('lame');

type Mp3Encoder = {
  configure(o: { channels: 1 | 2; sampleRate: number; bitrate: number }): void;
  encode(chans: Float32Array[]): Uint8Array;
  finalize(): Uint8Array;
};

const FRAME_SAMPLES = 1152;

class Mp3AudioEncoder extends CustomAudioEncoder {
  private enc!: Mp3Encoder;
  private rest: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private frame = 0;
  static override supports(codec: AudioCodec, config: AudioEncoderConfig): boolean {
    return codec === 'mp3' && config.sampleRate === 48_000 && (config.numberOfChannels === 1 || config.numberOfChannels === 2);
  }
  async init() {
    try {
      const { createEncoder } = await import('wasm-media-encoders');
      this.enc = (await createEncoder('audio/mpeg', `${vendorDir('lame')}mp3.wasm`)) as Mp3Encoder;
    } catch (cause) {
      const err = new NamedError('Mp3FallbackFailed', 'The sound encoder could not load. Check your connection and try again.');
      err.name = 'AudioEncoderLoadError';
      err.cause = cause;
      throw err;
    }
    this.enc.configure({ channels: this.config.numberOfChannels as 1 | 2, sampleRate: this.config.sampleRate, bitrate: 192 });
  }
  encode(sample: AudioSample) {
    const n = sample.numberOfFrames;
    const chans = Array.from({ length: this.config.numberOfChannels }, (_, c) => {
      const out = new Float32Array(n);
      sample.copyTo(out, { planeIndex: Math.min(c, sample.numberOfChannels - 1), format: 'f32-planar' });
      return out;
    });
    this.push(this.enc.encode(chans));
  }
  flush() {
    this.push(this.enc.finalize());
  }
  close() {}
  private push(out: Uint8Array) {
    const all = new Uint8Array(this.rest.length + out.length);
    all.set(this.rest);
    all.set(out, this.rest.length);
    const { frames, rest } = splitMp3Frames(all);
    this.rest = rest;
    for (const data of frames) {
      const packet = new EncodedPacket(data, 'key', (this.frame * FRAME_SAMPLES) / this.config.sampleRate, FRAME_SAMPLES / this.config.sampleRate);
      this.frame++;
      this.onPacket(packet, { decoderConfig: { codec: 'mp3', sampleRate: this.config.sampleRate, numberOfChannels: this.config.numberOfChannels } });
    }
  }
}

let registered = false;
/** Make MP3 available to Mediabunny's encoders. Safe to call more than once. */
export function registerMp3Fallback(): void {
  if (registered) return;
  registered = true;
  registerEncoder(Mp3AudioEncoder);
}

/** The browser has no encoder for any sound format the video can hold (iOS 18 and earlier, and the MP3 fallback failed to load). */
export class NoAudioEncoder extends Error {
  constructor(message: string) {
    super(message);
    // Set by hand: a minified class name would not survive into the name.
    this.name = 'NoAudioEncoder';
  }
}

/** The error for a video that has sound this browser cannot write: what to do about it, for the visitor. */
export function noAudioEncoder(canMute: boolean): NoAudioEncoder {
  return new NoAudioEncoder(
    `This browser cannot write sound into a video.${canMute ? ' Tick Remove the sound to get the picture alone, or' : ''} On an iPhone, update iOS or use a computer; elsewhere, use a recent Chrome, Edge, Safari or Firefox.`,
  );
}

/**
 * The first sound codec this browser can encode, from `preferred` (the browser's own AAC and Opus
 * encoders, in that order) and then MP3 from the WebAssembly encoder, which only runs when the
 * browser has none of the others. Null when none can be written.
 */
export async function firstEncodableSound(preferred: AudioCodec[], config: { numberOfChannels: number; sampleRate: number; bitrate: number | Quality }): Promise<AudioCodec | null> {
  registerMp3Fallback();
  return getFirstEncodableAudioCodec([...preferred, 'mp3'], config);
}
