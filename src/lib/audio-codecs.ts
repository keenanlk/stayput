/**
 * Which decoders get a turn, and in what order, for a sound the browser's own `decodeAudioData` may refuse, and what a
 * sound nothing here can read is called. One place for the audio tools (audio.ts) and the speech tools (speech-audio.ts), so
 * the two never disagree about a codec. Kept free of browser imports so a spec can drive it directly.
 */
import type { InputAudioTrack } from 'mediabunny';

/** wrap: the packets are copied into a small MP4 the browser reads (AAC, MP3). browser: `decodeAudioData`. webcodecs: Mediabunny's AudioDecoder sink. ac3: the same sink after the Dolby decoder is registered. amr: the libav build the 3GP page ships. */
export type DecodeStep = 'wrap' | 'browser' | 'webcodecs' | 'ac3' | 'amr';

/** What is known of a sound: Mediabunny's codec name (null for one it does not name) and the container's own code for it. */
export interface SoundKind {
  codec: string | null;
  id?: string;
}

/** The container codes of the AMR speech codecs libav can decode here. AMR-WB+ ('sawp') is not among them. */
const AMR_IDS = new Set(['samr', 'sawb']);

/** Whether the sound is AMR (narrow or wide band) that the libav build reads. */
export const isAmr = (s: SoundKind) => !s.codec && AMR_IDS.has((s.id ?? '').toLowerCase());
/** Whether the sound is wide-band AMR. */
export const isAmrWide = (s: SoundKind) => (s.id ?? '').toLowerCase() === 'sawb';
export const isDolby = (s: SoundKind) => s.codec === 'ac3' || s.codec === 'eac3';

/**
 * The steps to try, first to last. `audioDecoder` says whether the page has WebCodecs `AudioDecoder` (Safari before 26 does
 * not); `stretchFirst` is for a video, whose sound is better copied out a stretch at a time than handed over whole.
 */
export function decoderOrder(sound: SoundKind, env: { audioDecoder: boolean; stretchFirst?: boolean }): DecodeStep[] {
  // The Dolby codecs have no browser decoder outside a few platforms; the registered one does not need AudioDecoder.
  if (isDolby(sound)) return ['browser', 'ac3'];
  if (isAmr(sound)) return ['browser', 'amr'];
  const wrappable = sound.codec === 'aac' || sound.codec === 'mp3' || (!sound.codec && !sound.id);
  const steps: DecodeStep[] = wrappable ? (env.stretchFirst ? ['wrap', 'browser'] : ['browser', 'wrap']) : ['browser'];
  if (env.audioDecoder) steps.push('webcodecs');
  return steps;
}

/** What the sound is called to the person looking at the page. */
const FORMAT_NAMES: Record<string, string> = {
  aac: 'AAC',
  mp3: 'MP3',
  opus: 'Opus',
  vorbis: 'Vorbis',
  flac: 'FLAC',
  ac3: 'Dolby Digital (AC-3)',
  eac3: 'Dolby Digital Plus (E-AC-3)',
  dts: 'DTS',
  ulaw: 'µ-law',
  alaw: 'A-law',
  // A format Mediabunny reads but does not name: the container's own code for it.
  samr: 'AMR (the voice format of some Android recorders)',
  sawb: 'AMR-WB (the voice format of some Android recorders)',
  sawp: 'AMR-WB+',
  'ima4': 'IMA ADPCM',
  alac: 'Apple Lossless (ALAC)',
};

/** The name of a sound's format, or '' when nothing says. */
export function soundFormatName(sound: SoundKind | null): string {
  if (!sound) return '';
  if (sound.codec) return FORMAT_NAMES[sound.codec] ?? (sound.codec.startsWith('pcm') ? 'uncompressed PCM' : '');
  const id = sound.id;
  if (typeof id !== 'string') return '';
  return FORMAT_NAMES[id.toLowerCase()] ?? (/^[\x20-\x7e]{4}$/.test(id) ? `the "${id.trim()}" format` : '');
}

/** A track as the kind of sound it holds. */
export const soundOf = (track: InputAudioTrack | null): SoundKind | null => (track ? { codec: track.codec ?? null, id: typeof track.internalCodecId === 'string' ? track.internalCodecId : undefined } : null);

/** What a bare AMR file ("#!AMR\n" or "#!AMR-WB\n" first) says it is, for a file with no container for the demuxer to read. */
export function sniffAmr(head: Uint8Array): SoundKind | null {
  const text = new TextDecoder('latin1').decode(head.subarray(0, 9));
  if (text.startsWith('#!AMR-WB')) return { codec: null, id: 'sawb' };
  if (text.startsWith('#!AMR')) return { codec: null, id: 'samr' };
  return null;
}

/** AAC and MP3 are read everywhere, so a failure on them is a damaged file or a flaky decoder, not an unsupported format. */
export const isCommonFormat = (format: string) => format.startsWith('AAC') || format.startsWith('MP3');

/** The sentence for a sound this browser could not read, naming its format where that is known. `format` is '' when nothing says. */
export function undecodableText(format: string): string {
  if (!format) return "No audio could be read from this file. It may have no sound track, or use an audio format this browser can't decode.";
  return isCommonFormat(format)
    ? `This browser could not decode this file's ${format} sound. Try again, or try Chrome or Edge on a computer.`
    : `This file's sound is ${format}, which this browser can't decode. Try Chrome or Edge on a computer, or save the video again with AAC sound and add that.`;
}
