/**
 * Sound as plain numbers, for the video tools that build a new sound track
 * (speed, merge, add audio): decode a file's sound with the browser's own
 * decoders, and feed PCM into a Mediabunny audio source in step with the
 * pictures.
 */
import { AudioSample, type AudioSampleSource } from 'mediabunny';
import { isNotReadable } from './read-failure';
import { decodeWithin, refuseSoundlessContainer } from './decode-guard';

export const SAMPLE_RATE = 48_000;

/** The file's sound as one or two channels at 48 kHz, or null when it has none the browser can read. */
export async function decodePcm(file: Blob): Promise<Float32Array[] | null> {
  const ctx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  try {
    await refuseSoundlessContainer(file);
    const buffer = await decodeWithin(ctx, await file.arrayBuffer());
    return Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i));
  } catch (e) {
    // A file the browser cannot read is not one it cannot decode: say so, as the demuxer would only fail the same way.
    if (isNotReadable(e)) throw e;
    // Safari refuses a QuickTime .mov whole; its sound track is read through the demuxer instead.
    const { demuxedFileSound } = await import('./demux-audio');
    return demuxedFileSound(file, SAMPLE_RATE, false).catch((err) => {
      if (isNotReadable(err)) throw err;
      return null;
    });
  }
}

/** Two channels, whatever came in (mono is copied to both sides). */
export function stereo(chans: Float32Array[]): Float32Array[] {
  return chans.length >= 2 ? chans.slice(0, 2) : [chans[0]!, chans[0]!];
}

/** Hands PCM to an audio source in 4096-sample pieces, up to a given time. */
export function pcmFeeder(source: AudioSampleSource | null, chans: Float32Array[] | null, rate = SAMPLE_RATE) {
  let at = 0;
  const len = chans?.[0]?.length ?? 0;
  return {
    length: len,
    async until(seconds: number) {
      if (!source || !chans) return;
      const end = Math.min(len, Math.round(seconds * rate));
      while (at < end) {
        const n = Math.min(4096, end - at);
        const data = new Float32Array(n * chans.length);
        chans.forEach((ch, c) => data.set(ch.subarray(at, at + n), c * n));
        const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: chans.length, sampleRate: rate, timestamp: at / rate });
        await source.add(sample);
        sample.close();
        at += n;
      }
    },
  };
}
