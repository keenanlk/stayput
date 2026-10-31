/**
 * Helpers for sound the browser's own decoder (`decodeAudioData`) refuses and the page's decoders take instead: the Dolby decoder
 * (AC-3, E-AC-3) that Mediabunny's extension adds as WebAssembly, the libav build the 3GP page ships (AMR), and the name a sound
 * nothing here can read goes by (UnsupportedAudioCodec). The order the decoders get a turn in is decoderOrder (audio-codecs.ts); the
 * audio tools (pcm.ts) and the caption tools (speech-audio.ts) both follow it.
 */
import { EncodedPacketSink, type InputAudioTrack } from 'mediabunny';
import { isAmrWide, isCommonFormat, sniffAmr, soundFormatName, undecodableText, type SoundKind } from './audio-codecs';
import { decodeAmrFrames } from './amr-sound';
import { splitAmr } from './amr-frames';
import { NamedError } from './input-error';

export const hasAudioDecoder = () => typeof AudioDecoder !== 'undefined';

let ac3: Promise<void> | undefined;
/** The Dolby decoder registered with Mediabunny, loaded on first use (a lazy chunk of WebAssembly, only for these files). A failed load is tried again next time. */
export function ensureAc3(): Promise<void> {
  ac3 ??= import('@mediabunny/ac3').then((m) => m.registerAc3Decoder()).catch((e) => ((ac3 = undefined), Promise.reject(e)));
  return ac3;
}

/** The sound of a file with no container: a bare .amr file says what it is in its first bytes. */
export async function bareSound(file: Blob): Promise<SoundKind | null> {
  return sniffAmr(new Uint8Array(await file.slice(0, 9).arrayBuffer().catch(() => new ArrayBuffer(0))));
}

/**
 * The error for a sound this browser and the decoders shipped here cannot read, naming its format so a failed run records it.
 * Null when the format is not named, or is AAC or MP3 (read everywhere, so a failure on them is a damaged file and the caller's
 * own message says so).
 */
export function refusalFor(sound: SoundKind | null, cause?: unknown): Error | null {
  const format = soundFormatName(sound);
  if (!format || isCommonFormat(format)) return null;
  return new NamedError('UnsupportedAudioCodec', undecodableText(format), cause === undefined ? undefined : { cause });
}


/** `source` at `rate`: itself when it is there already, otherwise rendered through an offline context. */
export async function resampleTo(source: AudioBuffer, rate: number): Promise<AudioBuffer> {
  if (source.sampleRate === rate) return source;
  const ctx = new OfflineAudioContext(source.numberOfChannels, Math.max(1, Math.ceil((source.length * rate) / source.sampleRate)), rate);
  const node = ctx.createBufferSource();
  node.buffer = source;
  node.connect(ctx.destination);
  node.start();
  return ctx.startRendering();
}

/** AMR speech as mono samples at `rate`: frames cut out of a bare file or lifted from a 3GP or MP4 track, decoded by the libav build. */
export async function amrPcm(file: Blob, track: InputAudioTrack | null, sound: SoundKind, rate: number): Promise<Float32Array[]> {
  let decoded: { samples: Float32Array; rate: number };
  if (track) {
    const frames: Uint8Array[] = [];
    for await (const p of new EncodedPacketSink(track).packets()) frames.push(p.data);
    decoded = await decodeAmrFrames(frames, isAmrWide(sound));
  } else {
    // Bigger than any voice recording (12.2 kbit/s is 90 MB in 16 hours), so it is not AMR speech.
    if (file.size > 256 * 1024 ** 2) throw new NamedError('AmrDecodeFailed', 'This file is too big to be an AMR recording.');
    const bare = splitAmr(new Uint8Array(await file.arrayBuffer()));
    if (!bare) throw new NamedError('AmrDecodeFailed', 'No AMR sound could be read from this file.');
    decoded = await decodeAmrFrames(bare.frames, bare.wide);
  }
  const source = new AudioBuffer({ length: decoded.samples.length, numberOfChannels: 1, sampleRate: decoded.rate });
  source.copyToChannel(decoded.samples as Float32Array<ArrayBuffer>, 0);
  return [(await resampleTo(source, rate)).getChannelData(0)];
}
