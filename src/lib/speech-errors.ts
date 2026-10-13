/**
 * What can go wrong when writing captions from speech, each with its own error
 * name (the short kind a failed run records; the message is never sent) and a
 * message that says what to try next. Shared by the main thread and the
 * Whisper worker, so a name survives the trip across postMessage.
 */

export const SPEECH_ERRORS = ['ModelDownloadError', 'ModelLoadError', 'OutOfMemoryError', 'AudioDecodeError', 'WorkerCrashError', 'SpeechModelError', 'NoSpeechFound'] as const;
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
const REFUSALS = ['Error', 'EncodingError', 'NotSupportedError', 'DataError', 'UnsupportedInputFormatError'];

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
  if (cause !== undefined && !looksLikeMemory(cause)) err.name = classNameOf(cause) as SpeechErrorName;
  return err;
};
/** The speech step failed on a phone with a video over the phone limit, with an error that names no cause: out of memory, as far as anything can tell. There is no caption file yet. */
export const phoneSpeechMemoryError = (cause?: unknown) => {
  const err = make('OutOfMemoryError', 'This phone ran out of memory while writing captions for a video this big. Trim the video to about 2 minutes or less, or use a computer. If you try again, reload the page first.');
  if (cause !== undefined) err.cause = cause;
  if (cause !== undefined && !looksLikeMemory(cause) && !(cause instanceof SpeechError)) err.name = classNameOf(cause) as SpeechErrorName;
  return err;
};
/** The redraw failed for a reason no one named, after the captions were written: say so, and that the subtitles are ready. */
export function encodeFailedError(cause: unknown): Error {
  const err = new Error('The video could not be redrawn with captions. Your subtitles are ready: download the .srt below, then try a shorter video or another file.');
  err.name = classNameOf(cause);
  err.cause = cause;
  return err;
}
export const speechModelError = () => make('SpeechModelError', 'The speech model could not read this recording. Try again, or try a shorter recording or another file.');
export const noSpeechFound = (message: string) => make('NoSpeechFound', message);

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
  const err = new Error('Something went wrong while writing the captions. Reload the page and try again, or try a shorter video or another file.');
  err.name = classNameOf(e);
  err.cause = e;
  return err;
}

/** An error's class name when it looks like one, else 'Error': the only part of a failure that is recorded. */
function classNameOf(e: unknown): string {
  return e instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(e.name) ? e.name : 'Error';
}

/** The error to show for a failed caption step: our own named errors pass through, the rest become plain ones. */
export function plainCaptionError(e: unknown): Error {
  if (e instanceof SpeechError) return e;
  if (looksLikeMemory(e)) return outOfMemoryError();
  return unknownCaptionError(e);
}
