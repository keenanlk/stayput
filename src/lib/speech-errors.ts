/**
 * What can go wrong when writing captions from speech, each with its own error
 * name (the short kind a failed run records; the message is never sent) and a
 * message that says what to try next. Shared by the main thread and the
 * Whisper worker, so a name survives the trip across postMessage.
 */
import { NamedError, isUnspecific } from './input-error';

import { isNotReadable } from './read-failure';

export const SPEECH_ERRORS = ['ModelDownloadError', 'ModelOffline', 'StorageFull', 'ModelVerifyFailed', 'ModelLoadError', 'OutOfMemoryError', 'AudioDecodeError', 'WorkerCrashError', 'SpeechModelError', 'NoSpeechFound', 'RecordingTooLong'] as const;
export type SpeechErrorName = (typeof SPEECH_ERRORS)[number];

export class SpeechError extends Error {
  /** What went wrong, as the page decides what to say; `name` may later be set to the underlying class so a failed run records the cause. */
  readonly kind: SpeechErrorName;
  constructor(name: SpeechErrorName, message: string) {
    super(message);
    this.kind = name;
    // Set by hand: a minified class name would not survive into the name.
    this.name = name;
  }
}

const make = (name: SpeechErrorName, message: string) => new SpeechError(name, message);

export const modelDownloadError = () =>
  make('ModelDownloadError', 'The speech model (77 MB) could not be downloaded. Check your connection, then try again: a download that stopped part way starts over. On mobile data, Wi-Fi is steadier.');
export const modelLoadError = () =>
  make('ModelLoadError', 'The speech model downloaded but could not be started in this browser. Reload the page and try again, or use an up-to-date Chrome, Edge or Firefox on a computer.');
export const outOfMemoryError = () =>
  make('OutOfMemoryError', "This device ran out of memory while writing captions. Close other tabs and apps and try again, use a shorter recording, or use a desktop browser.");
/** Errors that only say a decoder or the container reader would not take the sound: what AudioDecodeError already means. */
// A bare TypeError names nothing either (a failed fetch or a bad argument), so it is the step's name that is recorded.
const REFUSALS = ['Error', 'TypeError', 'EncodingError', 'NotSupportedError', 'DataError', 'UnsupportedInputFormatError'];

/**
 * No sound could be read. `cause` is whatever failed underneath: when it has a class name of its own (a
 * RangeError, a NotReadableError) the run records that name, so the causes split in the stats; the message
 * is never shown or recorded. A decoder that simply refuses the sound (EncodingError, NotSupportedError) is
 * what AudioDecodeError already means, so it keeps that name.
 */
export const audioDecodeError = (message = 'No audio could be read from this file. It may have no sound track, or use an audio format this browser cannot decode.', cause?: unknown) => {
  const err = make('AudioDecodeError', message);
  if (cause === undefined) return err;
  err.cause = cause;
  const named = classNameOf(cause);
  if (!REFUSALS.includes(named)) err.name = named as SpeechErrorName;
  return err;
};
export const workerCrashError = () =>
  make('WorkerCrashError', 'The speech model stopped unexpectedly, which usually means the browser ran short of memory. Close other tabs and try again, or use a shorter recording.');
/** The re-encode ran out of memory after the captions were written. The tool attaches the caption file it already made. */
export const encodeMemoryError = (cause?: unknown) => {
  const err = make('OutOfMemoryError', 'This video is too long for your browser to redraw with captions. Your subtitles are ready: download the .srt below, or trim or split the video and try again. To try again, reload the page first.');
  // Kept so the page can tell a reclaimed codec from a real memory failure; never shown or recorded.
  if (cause !== undefined) err.cause = cause;
  // A browser error nobody named as memory keeps its class name, so a failed run still records what it was.
  if (cause !== undefined && !looksLikeMemory(cause)) err.name = classNameOf(cause, 'RedrawFailed') as SpeechErrorName;
  return err;
};
/** The speech step failed on a phone with a video over the phone limit, with an error that names no cause: out of memory, as far as anything can tell. There is no caption file yet. */
export const phoneSpeechMemoryError = (cause?: unknown) => {
  const err = make('OutOfMemoryError', 'This phone ran out of memory while writing captions for a video this big. Trim the video to about 2 minutes or less, or use a computer. If you try again, reload the page first.');
  if (cause !== undefined) err.cause = cause;
  if (cause !== undefined && !looksLikeMemory(cause) && !(cause instanceof SpeechError)) err.name = classNameOf(cause, 'CaptionStepFailed') as SpeechErrorName;
  return err;
};
/** The redraw failed for a reason no one named, after the captions were written: say so, and that the subtitles are ready. */
export function encodeFailedError(cause: unknown): Error {
  const err = new NamedError('RedrawFailed', 'The video could not be redrawn with captions. Your subtitles are ready: download the .srt below, then try a shorter video or another file.');
  // A bare `Error` from the encoder or demuxer says nothing, so the step is the name.
  err.name = classNameOf(cause, 'RedrawFailed');
  err.cause = cause;
  return err;
}
export const speechModelError = () => make('SpeechModelError', 'The speech model could not read this recording. Try again, or try a shorter recording or another file.');
/**
 * Seconds of sound the speech step may hold in memory on this device. The samples (16 kHz, 4 bytes each) are kept whole, and
 * each piece is copied again for the worker and once more for a retry, so three copies must fit in a quarter of the memory
 * the browser admits to (`navigator.deviceMemory`, in GB, capped at 8 and missing in Safari and Firefox: then 4 GB on a
 * computer and 1.5 GB on a phone, the figure the phone limit was measured against).
 */
export function speechSecondsBudget(deviceMemoryGb: number | undefined, phone: boolean): number {
  const gb = deviceMemoryGb && deviceMemoryGb > 0 ? deviceMemoryGb : phone ? 1.5 : 4;
  return Math.floor((gb * 1e9 * 0.25) / 3 / (16000 * 4));
}
/** A recording longer than the device's budget, refused before any sound is read or the model is fetched. */
export const recordingTooLongError = (seconds: number, budget: number) =>
  make('RecordingTooLong', `This recording is about ${Math.round(seconds / 60)} minutes, more than this device can write captions for without running out of memory (about ${Math.floor(budget / 60)} minutes). Trim it or split it into parts, or use a computer with more memory.`);
export const noSpeechFound = (message: string) => make('NoSpeechFound', message);

/** The page's own "recording too long" refusal: its message says "memory", but it is not an out-of-memory failure and must reach the person as written. */
export const isRecordingTooLong = (e: unknown): boolean => e instanceof Error && e.name === 'RecordingTooLong';

/** A browser or runtime error that means "out of memory", as far as its message tells. */
export function looksLikeMemory(e: unknown): boolean {
  if (typeof e === 'object' && e && (e as { name?: string }).name === 'QuotaExceededError') return false;
  // A RangeError is memory only when its message says so: a bad buffer length is not, and keeps its own class name.
  const text = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return /out of memory|memory|bad_alloc|allocation failed|array buffer allocation/i.test(text);
}

/** A failed fetch: the browser reports these as a TypeError with no useful message. */
export function looksLikeNetwork(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  // transformers.js reports a local file it could not fetch as "not found locally", whatever the real cause (a dropped connection, say).
  if (e instanceof Error && e.name === 'ModelFileNotFoundError') return true;
  const text = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return /failed to fetch|network|load failed|could not locate|not found locally|status 5\d\d|ERR_/i.test(text);
}

/** Rebuild an error that came across the worker boundary from its name. Unknown names become SpeechModelError. */
export function fromWorker(name: string, message: string): SpeechError {
  return new SpeechError((SPEECH_ERRORS as readonly string[]).includes(name) ? (name as SpeechErrorName) : 'SpeechModelError', message);
}

/**
 * An error from a caption step that no one wrote a message for, shown as a
 * plain sentence. It keeps the original error's name (a class name only), so
 * a failed run still records what went wrong; the original message is not shown.
 */
export function unknownCaptionError(e: unknown): Error {
  const err = new NamedError('CaptionStepFailed', 'Something went wrong while writing the captions. Reload the page and try again, or try a shorter video or another file.');
  err.name = classNameOf(e, 'CaptionStepFailed');
  err.cause = e;
  return err;
}

/** An error's class name when it looks like a specific one, else the fallback (a bare Error or TypeError says nothing): the only part of a failure that is recorded. */
function classNameOf(e: unknown, fallback = 'Error'): string {
  return e instanceof Error && !isUnspecific(e) && e.name !== 'TypeError' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(e.name) ? e.name : fallback;
}

/** The error to show for a failed caption step: our own named errors pass through, the rest become plain ones. */
export function plainCaptionError(e: unknown): Error {
  if (e instanceof SpeechError) return e;
  // A file the browser would not read keeps its own name and message: it is not the sound's fault.
  if (isNotReadable(e) && e instanceof Error) return e;
  if (looksLikeMemory(e)) return keepSalvage(e, outOfMemoryError());
  return keepSalvage(e, unknownCaptionError(e));
}

/** Failures of the speech model's start-up that a fresh worker may get past (a worker that died or ran out of memory, a kept copy that would not start). */
export function restartsOnce(e: { name: string }): boolean {
  return ['ModelLoadError', 'OutOfMemoryError', 'WorkerCrashError'].includes(e.name);
}

/** Moves the partial transcript a failed speech run carries (`salvage`) from one error to the one that replaces it. */
export function keepSalvage<T extends Error>(from: unknown, to: T): T {
  const salvage = (from as { salvage?: unknown } | null)?.salvage;
  return salvage ? Object.assign(to, { salvage }) : to;
}
