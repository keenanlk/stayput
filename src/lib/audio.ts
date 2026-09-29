/**
 * Audio out of a video or audio file, entirely in the browser. The browser's
 * own decoders read the soundtrack (AAC in MP4, MOV and M4A; Opus or Vorbis in
 * WebM; MP3, WAV, FLAC), and the result is written as MP3 by LAME compiled to
 * WebAssembly (wasm-media-encoders, served from /vendor/) or as 16-bit WAV by
 * the small writer below.
 */
import { vendorDir } from './vendor';

/** MP3 is almost always 44.1 kHz; decoding resamples to it. */
export const SAMPLE_RATE = 44100;

/** Decode the file's audio track into PCM at `rate`. The whole file is read into memory first. */
export async function decodeAudio(file: File, rate = SAMPLE_RATE): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, rate);
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(bytes);
  } catch {
    throw new Error('No audio could be read from this file. It may have no sound track, or use an audio format this browser cannot decode.');
  }
  return buffer.numberOfChannels > 2 ? downmixToStereo(buffer) : buffer;
}

/**
 * Surround (5.1, quad, spatial) down to stereo with the Web Audio speaker
 * rules, so the centre channel, where film dialogue lives, is kept.
 */
async function downmixToStereo(buffer: AudioBuffer): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.channelInterpretation = 'speakers';
  source.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

/** The buffer's channels, mixed down to one when `mono` is set (and a mono source stays mono). */
export function channelsOf(buffer: AudioBuffer, mono: boolean): Float32Array[] {
  const chans = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i));
  if (!mono || chans.length === 1) return chans;
  const out = new Float32Array(buffer.length);
  const [l, r] = chans as [Float32Array, Float32Array];
  for (let i = 0; i < out.length; i++) out[i] = (l[i]! + r[i]!) / 2;
  return [out];
}

export type Bitrate = 96 | 128 | 160 | 192 | 256 | 320;

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/** Encode PCM channels as a constant-bitrate MP3. `onProgress` gets 0 to 1. */
export async function encodeMp3(chans: Float32Array[], bitrate: Bitrate, onProgress?: (f: number) => void): Promise<Blob> {
  const { createEncoder } = await import('wasm-media-encoders');
  const encoder = await createEncoder('audio/mpeg', `${vendorDir('lame')}mp3.wasm`);
  encoder.configure({ channels: chans.length as 1 | 2, sampleRate: SAMPLE_RATE, bitrate });
  const parts: BlobPart[] = [];
  const total = chans[0]!.length;
  // About three seconds of audio per call, then give the page a moment to repaint.
  const step = 1152 * 115;
  for (let i = 0; i < total; i += step) {
    const out = encoder.encode(chans.map((c) => c.subarray(i, Math.min(total, i + step))));
    // The encoder reuses its output buffer, so copy before the next call.
    parts.push(out.slice());
    onProgress?.(Math.min(1, (i + step) / total));
    await yieldToUi();
  }
  parts.push(encoder.finalize().slice());
  return new Blob(parts, { type: 'audio/mpeg' });
}

/** Write PCM channels as a 16-bit little-endian WAV file. */
export function encodeWav(chans: Float32Array[], rate = SAMPLE_RATE): Blob {
  const n = chans[0]!.length;
  const ch = chans.length;
  const dataBytes = n * ch * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, ch, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c]![i]!));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** "3:07" or "1:02:45". */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
