/**
 * Audio out of a video or audio file, entirely in the browser. The browser's
 * own decoders read the soundtrack (AAC in MP4, MOV and M4A; Opus or Vorbis in
 * WebM; MP3, WAV, FLAC), and the result is written as MP3 by LAME compiled to
 * WebAssembly (wasm-media-encoders, served from /vendor/) or as 16-bit WAV by
 * the small writer below.
 */
import { vendorDir } from './vendor';
import { audioDecodeError } from './speech-errors';
import { decodeWma, isAsf } from './wma-convert';
import { decodeWithin, refuseSoundlessContainer } from './decode-guard';
import { retryUnreadable } from './read-failure';
import { isPhoneBrowser } from './phone-limit';
import { AUDIO_COPY, stageError } from './bare-error';
import { resampleTo } from './odd-audio';

/** MP3 is almost always 44.1 kHz; decoding resamples to it. */
export const SAMPLE_RATE = 44100;

/** The size above which a file is decoded in stretches instead of read whole: a phone gives a tab far less memory than a computer. */
export const stretchBytes = (phone = isPhoneBrowser()) => (phone ? 150 * 1024 ** 2 : 1024 ** 3);

/** The first bytes say a WAV is the 64-bit variant (RF64, or BW64) that the browsers' decoders do not all read. */
async function isRf64(file: Blob): Promise<boolean> {
  const head = new TextDecoder('latin1').decode(await file.slice(0, 4).arrayBuffer().catch(() => new ArrayBuffer(0)));
  return head === 'RF64' || head === 'BW64';
}

/** Why a decode that failed on this file failed, when the file says so itself: a WAV too big for the format the browser reads. */
async function unsupportedWav(file: Blob): Promise<Error | null> {
  if (await isRf64(file)) return audioDecodeError(AUDIO_COPY.unsupportedWav);
  const riff = new TextDecoder('latin1').decode(await file.slice(0, 4).arrayBuffer().catch(() => new ArrayBuffer(0))) === 'RIFF';
  return riff && file.size > 4 * 1024 ** 3 ? audioDecodeError(AUDIO_COPY.unsupportedWav) : null;
}

/**
 * Decode the file's audio track into PCM at `rate`. A file under the size limit is read into memory whole and handed to the
 * browser's decoder; a bigger one is decoded in stretches through the demuxer (see decodePcmSliced). A sound the browser
 * refuses is tried with the page's own decoders (Opus or FLAC in MP4, ALAC, AC-3, AMR; see odd-audio.ts) unless `oddCodecs` is
 * off, which a caller does when it runs that step itself (the caption tools).
 */
export async function decodeAudio(file: File, rate = SAMPLE_RATE, oddCodecs = true): Promise<AudioBuffer> {
  // Windows Media Audio: no browser decodes it, so a separately loaded decoder module does.
  if (await isAsf(file)) return decodeWma(file, rate);
  await refuseSoundlessContainer(file);
  if (file.size > stretchBytes()) {
    const { decodePcmSliced } = await import('./pcm');
    // The stretch decoder's out-of-memory error is worded for a video; this is a recording.
    const chans = await decodePcmSliced(file, rate, false).catch((e) => {
      throw e instanceof Error && e.name === 'OutOfMemoryError' && e.cause ? stageError('AudioDecodeFailed', e.cause) : e;
    });
    if (chans?.[0]?.length) return toAudioBuffer(chans, rate);
  }
  const read = () => retryUnreadable(file, () => file.arrayBuffer());
  // A file that cannot be read is no decode failure, so the first read is made out here; the decoder is handed it, and only a second attempt reads again.
  const firstRead = await read();
  let handedOut = false;
  const supply = () => (handedOut ? read() : ((handedOut = true), Promise.resolve(firstRead)));
  const ctx = new OfflineAudioContext(2, 1, rate);
  let buffer: AudioBuffer;
  try {
    buffer = await decodeWithin(ctx, supply);
  } catch (first) {
    buffer = await decodeThroughDemuxer(file, rate, first).catch(async (error) => {
      // Sound in a codec the browser lacks (Opus in MP4, ALAC, AC-3, AMR): the page's decoders, or a named refusal.
      const odd = oddCodecs ? await (await import('./pcm')).decodePcmByPageDecoders(file, rate) : null;
      if (odd?.[0]?.length) return toAudioBuffer(odd, rate);
      // Chrome cannot read AIFF at all, so plain PCM AIFF is read by hand as a last resort.
      const aiff = await decodeAiff(await read().catch(() => null), rate);
      if (!aiff) throw (await unsupportedWav(file)) ?? error;
      return aiff;
    });
  }
  return buffer.numberOfChannels > 2 ? downmixToStereo(buffer) : buffer;
}

/** Decoded channels as an AudioBuffer at `rate`. */
function toAudioBuffer(chans: Float32Array[], rate: number): AudioBuffer {
  const buffer = new AudioBuffer({ length: chans[0]!.length, numberOfChannels: chans.length, sampleRate: rate });
  chans.forEach((ch, c) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, c));
  return buffer;
}

/** PCM AIFF or AIFC as an AudioBuffer at `rate`, or null when it is not one this can read. */
async function decodeAiff(bytes: ArrayBuffer | null, rate: number): Promise<AudioBuffer | null> {
  if (!bytes) return null;
  const { parseAiff } = await import('./aiff');
  const aiff = parseAiff(bytes);
  if (!aiff) return null;
  const source = new AudioBuffer({ length: aiff.channels[0]!.length, numberOfChannels: aiff.channels.length, sampleRate: aiff.sampleRate });
  aiff.channels.forEach((ch, c) => source.copyToChannel(ch as Float32Array<ArrayBuffer>, c));
  return resampleTo(source, rate);
}

/**
 * Safari cannot decode a QuickTime .mov (what an iPhone records) as a whole, so the sound
 * track's packets are lifted out with the demuxer and decoded from a small MP4 wrapper.
 */
async function decodeThroughDemuxer(file: File, rate: number, firstError: unknown): Promise<AudioBuffer> {
  const { demuxedFileSound } = await import('./demux-audio');
  // The browser's refusal is what a failed run is recorded under, unless the demuxer fails in a way of its own.
  let cause = firstError;
  const chans = await demuxedFileSound(file, rate, false).catch((e) => ((cause = e instanceof Error ? e : cause), null));
  if (!chans?.length) throw audioDecodeError(undefined, cause);
  const buffer = new AudioBuffer({ length: chans[0]!.length, numberOfChannels: chans.length, sampleRate: rate });
  chans.forEach((ch, c) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, c));
  return buffer;
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

export type Bitrate = 32 | 48 | 64 | 80 | 96 | 112 | 128 | 160 | 192 | 224 | 256 | 320;

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
