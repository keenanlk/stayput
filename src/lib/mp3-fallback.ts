/**
 * Sound for an MP4 on browsers that cannot encode it: iOS 18 and earlier have
 * no AudioEncoder in any browser (Safari, Chrome and the rest all run on
 * WebKit there). The LAME encoder the audio tools already use (wasm-media-encoders,
 * LGPL, served from /vendor/) is registered with Mediabunny as an MP3 encoder,
 * and MP4 carries MP3 sound that iPhones play.
 */
import { CustomAudioEncoder, EncodedPacket, registerEncoder, type AudioCodec, type AudioSample } from 'mediabunny';
import { vendorDir } from './vendor';
import { splitMp3Frames } from './mp3-frames';

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
      const err = new Error('The sound encoder could not load. Check your connection and try again.');
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
