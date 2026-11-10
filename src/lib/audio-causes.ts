/**
 * The named causes a sound that cannot be read ends under, so the stats tell them apart. Each is an error_class value of its
 * own; AudioDecodeError is kept for what none of them says. The message is shown to the visitor and never sent.
 *
 *  - UnsupportedAudioCodec (odd-audio.ts): a codec this browser has no decoder for (Opus, AC-3, ALAC, AMR, DTS ...), after every fallback.
 *  - AudioCutShort: a file cut short, missing its index (an MP4 without its moov atom), with a zero-length sound track, or a WAV whose header promises more than the file holds.
 *  - DecodeTimeout: the browser's decoder gave no answer in time.
 *  - AudioOutOfMemory: the decoder or the buffer for its result could not be allocated.
 *  - AudioTooLong: a recording over what this device can hold decoded, refused before any of it is read (phones and low-memory devices).
 *  - NoSoundTrack: a video with no sound (an input problem, refused when the file is added).
 *
 * Kept free of browser and vendor imports so a spec can load it.
 */
import { NamedError } from './input-error';
import { isNotReadable } from './read-failure';

/** The names above that this module makes. */
export const AUDIO_CAUSES = ['AudioCutShort', 'DecodeTimeout', 'AudioOutOfMemory', 'AudioTooLong'] as const;

/** Every class a sound that cannot be read can end under, for the lists that treat them alike (a retry that cannot help; not a tab lost). */
export const AUDIO_INPUT_CLASSES = ['AudioDecodeError', 'NoSoundTrack', 'UnsupportedSound', 'AudioDamaged', 'NotAnAudioFile', 'UnsupportedAudioCodec', ...AUDIO_CAUSES] as const;

export const CUT_SHORT = 'This file looks cut short, or is missing its index, so no sound can be read from it. Record or export it again, or try another copy.';
export const DECODE_TIMEOUT = 'The browser could not finish reading the sound of this file, which usually means the file is damaged or cut short. Try another copy of it.';
export const DECODE_MEMORY = 'This device ran out of memory reading the sound of this file. Close other tabs and apps and try again, or use a shorter recording or a computer.';

export const audioCutShort = (message = CUT_SHORT, cause?: unknown) => new NamedError('AudioCutShort', message, cause === undefined ? undefined : { cause });
export const decodeTimeout = (budgetMs: number) => new NamedError('DecodeTimeout', DECODE_TIMEOUT, { cause: new NamedError('DecodeTimeout', `the browser's sound decoder gave no answer in ${Math.round(budgetMs / 1000)} s`) });
export const audioOutOfMemory = (cause?: unknown, message = DECODE_MEMORY) => new NamedError('AudioOutOfMemory', message, cause === undefined ? undefined : { cause });

const MEMORY_TEXT = /out of memory|bad_alloc|allocation failed|array buffer allocation|invalid (typed )?array length|memory/i;

/** An error that says a buffer could not be made: a RangeError, or any error whose message says memory ran out. */
export function isMemoryFailure(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === 'QuotaExceededError') return false;
  if (e instanceof RangeError || e.name === 'OutOfMemoryError') return true;
  return MEMORY_TEXT.test(e.message);
}

/** Whether `e` is already one of the page's own sound classes (it goes out as it is). */
export const isAudioClass = (e: unknown): boolean => e instanceof Error && (AUDIO_INPUT_CLASSES as readonly string[]).includes(e.name);

/**
 * The named cause of a failed decode when the error itself says it, or null when it says nothing (the caller then keeps
 * AudioDecodeError). A file the browser could not read, and our own classes, are not renamed.
 */
export function namedDecodeCause(e: unknown): Error | null {
  if (isNotReadable(e) || isAudioClass(e)) return e as Error;
  if (isMemoryFailure(e)) return audioOutOfMemory(e);
  return null;
}

/**
 * A WAV (or RF64) whose header promises more sound than the file holds: it was cut short, or its header lies. Reads the first 64 KB
 * only. False for anything that is not a RIFF/WAVE file, and for a file whose header agrees with its size.
 */
export function wavHeaderLies(head: Uint8Array, fileSize: number): boolean {
  if (head.length < 44) return false;
  const text = (o: number) => String.fromCharCode(...head.subarray(o, o + 4));
  if (text(0) !== 'RIFF' || text(8) !== 'WAVE') return false;
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  // Walk the chunks to the data chunk and compare what it says with what is left.
  let at = 12;
  while (at + 8 <= head.length) {
    const id = text(at);
    const size = v.getUint32(at + 4, true);
    if (id === 'data') return size !== 0xffffffff && size > 0 && at + 8 + size > fileSize + 1;
    at += 8 + size + (size % 2);
  }
  // The header says the file is longer than it is.
  return v.getUint32(4, true) + 8 > fileSize + 1;
}

/** Seconds of decoded sound (stereo, 32-bit, `rate` Hz) a device can hold at once. Measured per device class (see the pull request); `deviceMemoryGb` is navigator.deviceMemory when the browser says. */
export function decodedSecondsBudget(phone: boolean, deviceMemoryGb?: number, rate = 44100): number {
  // Bytes a tab may spend on decoded sound, with room for the copy a tool makes (trim, mix) and the encoder's input.
  const lowMemory = typeof deviceMemoryGb === 'number' && deviceMemoryGb > 0 && deviceMemoryGb <= 2;
  const bytes = phone || lowMemory ? PHONE_DECODED_BYTES : DESKTOP_DECODED_BYTES;
  return Math.floor(bytes / (rate * 2 * 4));
}
/** Decoded bytes an at-risk tab (phone, or 2 GB or less of memory) may hold. */
export const PHONE_DECODED_BYTES = 300 * 1024 ** 2;
/** Decoded bytes a tab on a computer may hold. */
export const DESKTOP_DECODED_BYTES = 3 * 1024 ** 3;

export const audioTooLong = (seconds: number, budget: number) =>
  new NamedError('AudioTooLong', `This recording is about ${Math.ceil(seconds / 60)} minutes, more than this device can read at once without running out of memory (about ${Math.max(1, Math.floor(budget / 60))} minutes). Cut it into shorter parts first, or use a computer.`);
