/**
 * A failure that arrives as a plain `Error` (or TypeError, RangeError, SyntaxError) says nothing about where it came
 * from in a failed run's record. This gives it the name of the step that failed, and leaves every error that already
 * has a name of its own (EncodingError, OutOfMemoryError, NotReadableError, our own classes) untouched, so the rules
 * that retry on those names still see them. Kept free of browser imports so a spec can drive it directly.
 */

import { NamedError, isUnspecific } from './input-error';

const BARE = new Set(['', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError']);

/** Whether `e` carries no name beyond the generic ones. A RangeError that says memory is memory, and counts as named. */
export function isBare(e: unknown): boolean {
  if (!(e instanceof Error)) return true;
  if (e.name === 'RangeError' && /memory|allocation/i.test(e.message)) return false;
  return BARE.has(e.name);
}

/** `e` itself when it has a name; otherwise an error named `step` (letters and digits only), keeping `e` as its cause. */
export function nameBare(step: string, e: unknown): Error {
  if (!isBare(e)) return e as Error;
  const err = new NamedError(step, e instanceof Error && e.message ? e.message : 'Something went wrong.');
  err.cause = e;
  return err;
}

/**
 * A RangeError that says memory ran out (a buffer that could not be allocated) reaches a failed run's record as plain
 * "RangeError", which also covers a bad length. Returns it as OutOfMemoryError, keeping it as the cause; anything else
 * comes back as it was.
 */
export function memoryRange(e: unknown): unknown {
  if (!(e instanceof RangeError) || !/memory|allocation/i.test(e.message)) return e;
  const err = new NamedError('OutOfMemoryError', 'This device ran out of memory while cutting the video. Close other tabs and apps and try again, use a shorter video, or use a computer.');
  err.cause = e;
  return err;
}

/** A link inside an error's message: the shell turns the first occurrence of `text` into an anchor to `href`. */
export interface ErrorLink {
  text: string;
  href: string;
}

const SPLIT_LINKS: ErrorLink[] = [
  { text: 'Audio splitter', href: '/tools/audio-splitter' },
  { text: 'Trim audio', href: '/tools/trim-audio' },
];

/** What the visitor reads for a failure the audio tools name (OutOfMemoryError, and the step names a bare error takes). */
export const AUDIO_COPY = {
  memory: { message: 'This device ran out of memory working on this recording. Close other tabs and try again, or cut it into shorter parts with the Audio splitter or Trim audio and run each part.', links: SPLIT_LINKS },
  /** The Audio splitter sends no one to itself. */
  memorySplitter: { message: 'This device ran out of memory reading this recording. Close other tabs and try again, or use a computer with more memory.', links: [] as ErrorLink[] },
  /** For the video branch of a tool that handles both. */
  memoryVideo: { message: 'This device ran out of memory working on this video. Close other tabs and apps and try again, use a shorter video, or use a computer.', links: [] as ErrorLink[] },
  read: 'This browser couldn\'t read the sound in this file. The file may be damaged, or in a format this browser can\'t play. Try another browser, or save the file as MP3 or WAV in another app and try again.',
  change: 'Something went wrong while changing the sound. Reload the page and try again. If it keeps failing, try a shorter part of the recording or another browser.',
  removeNoise: 'Something went wrong while removing the noise. Reload the page and try again. If it keeps failing, try a shorter part of the recording or another browser.',
  save: (format?: string) => `Saving the ${format ? `${format} ` : 'finished '}file failed. Try again, or choose another format.`,
  writeVideo: 'The volume was changed, but writing the video failed. Reload the page and try again. If it keeps failing, try another browser, or a shorter clip made with Trim video.',
  unsupportedWav: 'This WAV is in a large-file format (RF64, or over 4 GB) that this browser can\'t read. Export it again from the app that made it as a standard WAV or as FLAC, in parts under 4 GB if needed.',
};

/** The message (and links) a step's name carries when the error that reached it had none of its own to show. */
const STEP_COPY: Record<string, { message: string; links?: ErrorLink[] }> = {
  AudioDecodeFailed: { message: AUDIO_COPY.read },
  AudioTransformFailed: { message: AUDIO_COPY.change },
  AudioEncodeFailed: { message: AUDIO_COPY.save() },
  VolumeReadFailed: { message: AUDIO_COPY.read },
  VolumeWriteFailed: { message: AUDIO_COPY.writeVideo, links: [{ text: 'Trim video', href: '/tools/trim-video' }] },
  VolumeEncodeFailed: { message: AUDIO_COPY.save() },
  NoiseDecodeError: { message: AUDIO_COPY.read },
  NoiseRemoveError: { message: AUDIO_COPY.removeNoise },
};

/** Whether `e` reads as a buffer or an allocation the device could not make. On the audio path every RangeError is one: a length that did not fit. */
export function ranOutOfMemory(e: unknown): boolean {
  if (e instanceof RangeError) return true;
  return e instanceof Error && /out of memory|bad_alloc|allocation failed|array buffer allocation/i.test(e.message);
}

export interface StageOptions {
  /** Replaces the step's message for a bare error. */
  message?: string;
  links?: ErrorLink[];
  /** The memory error's words (AUDIO_COPY.memory unless given). */
  memory?: { message: string; links?: ErrorLink[] };
  /** Also take over a NamedError that only carries a file's default name (those end in "Failed"). */
  renameFailed?: boolean;
}

/**
 * The one way a step of the audio path names its failures. An error that already has a name of its own (EncodingError,
 * NotReadableError, NoSoundTrack, our own classes) comes back untouched, so the rules that retry on those names still see
 * them. A memory failure becomes OutOfMemoryError with audio wording, and a bare Error takes the step's name and the
 * step's message instead of the browser's. The original is kept as the cause.
 */
export function stageError(step: string, e: unknown, opts: StageOptions = {}): Error {
  const named = e instanceof Error && !BARE.has(e.name) && !(opts.renameFailed && isUnspecific(e));
  if (named) return e;
  const oom = ranOutOfMemory(e);
  const copy = oom ? opts.memory ?? AUDIO_COPY.memory : { message: opts.message ?? STEP_COPY[step]?.message ?? (e instanceof Error && e.message ? e.message : 'Something went wrong.'), links: opts.links ?? STEP_COPY[step]?.links };
  const err = new NamedError(oom ? 'OutOfMemoryError' : step, copy.message, { cause: e });
  if (copy.links?.length) (err as Error & { links?: ErrorLink[] }).links = copy.links;
  return err;
}
