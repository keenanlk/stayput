/**
 * What a re-encoding video job does about a failure before the person sees it.
 * Kept free of browser and codec imports so a spec can drive it directly.
 *
 * Two failures are common on phones and are often not the file's fault:
 *  - the page was hidden (apps switched, screen locked) and the browser took
 *    its video decoder or encoder back: wait for the page to come back, then
 *    run once more from the start;
 *  - the phone's video encoder gave up (EncodingError and its kin) or the
 *    tab ran out of memory: run once more with a smaller picture.
 *  - where the device can write video in software, the first encoder failure is retried that way at the same size
 *    (the hardware encoder is what gives up on most phones), before the picture is made smaller.
 * Anything else, and a failure after that, is thrown as it came, with its own name.
 */

/** Errors that say what the file is, or what the person gave: a retry cannot change them. */
const FINAL = new Set(['InputError', 'UnreadableFile', 'UnsupportedCodec', 'AudioDecodeError', 'NoSoundTrack', 'ConversionInvalid', 'EditUnsupported', 'NoSpeechFound']);

/**
 * What the shell stops an instant repeat of: FINAL, plus the other names that say the file itself cannot be used
 * (a picture that will not decode, a container nothing here opens, a cloud-only file). Same file and same options fail the same way.
 */
const SAME_EVERY_TIME = new Set([...FINAL, 'PictureUnreadable', 'UnsupportedContainer', 'FileNotDownloaded']);
export function failsTheSameAgain(name: string): boolean {
  return SAME_EVERY_TIME.has(name);
}

/** Encoder and memory failures that a smaller picture can get past. */
const SHRINKABLE = new Set(['EncodingError', 'OperationError', 'InvalidStateError', 'NotSupportedError', 'EncoderStall', 'OutOfMemoryError', 'EncoderRefused']);

/** Encoder failures worth one more try at the same size when the picture is already as small as a retry goes (not memory, which a repeat cannot fix). */
const AGAIN = new Set(['EncodingError', 'OperationError', 'InvalidStateError', 'NotSupportedError', 'EncoderStall']);

/** The ladder of longest sides a retry steps down. 1080p is the first rung, as a phone handles it comfortably. */
const STEPS = [1920, 1280, 854];

/** The next longest side below `longest`, or undefined when the picture is already as small as a retry goes. */
export function smallerSide(longest: number): number | undefined {
  return STEPS.find((s) => s < longest - 1);
}

export interface RecoveryHooks {
  /** The page was hidden at any time since the job started. */
  wasHidden(): boolean;
  /** Forget that, so a failure after the page came back is not blamed on it. */
  forgetHidden(): void;
  /** Resolves when the page is visible (at once if it is). */
  whenVisible(): Promise<void>;
  /** A codec the browser took back, as far as the error tells. */
  reclaimed(e: unknown): boolean;
  /** Whether a software encode is on offer here; when absent or false the first encoder failure goes straight to a smaller picture. */
  softwareEncode?(): boolean | Promise<boolean>;
  /** Allow one more try at the same size when the picture is already as small as a retry goes (a size the person chose). */
  sameSizeRetry?: boolean;
  /** Said to the person just before a second try. */
  onNotice?(message: string): void;
  /** The smaller size that last worked in this tab: a run starts there, and a retry that works at a smaller size is kept for the next run. */
  rung?: { get(): number | undefined; set(side: number): void };
}

export interface Attempt {
  /** Longest side of the output this try must stay within, when a retry asked for a smaller one. */
  maxSide?: number;
  /** Which kind of retry this is, if it is one. */
  retry?: 'resumed' | 'smaller' | 'again' | 'software' | 'remembered';
  /** This try started at the size that worked earlier in this tab, not at full size. */
  remembered?: boolean;
  /** The try really made the picture smaller than the source (set by capScale); a cap on a small clip changes nothing and is not mentioned. */
  capped?: boolean;
}

/**
 * The scale (at most 1) that keeps the longest side of a picture within this try's cap. Libs call it where they size the output;
 * it also records that the cap took effect, so the finished file's note can say so.
 */
export function capScale(attempt: Attempt, longest: number): number {
  if (attempt.maxSide && longest > attempt.maxSide) {
    attempt.capped = true;
    return attempt.maxSide / longest;
  }
  return 1;
}

/** The retry kind a finished file's note is about: a size cap that took effect from the start is said even when the page was hidden or the encoder retried on the way. */
export function retryOf(attempt: Attempt): RetryKind | undefined {
  if (attempt.remembered && attempt.capped && attempt.retry !== 'smaller') return 'remembered';
  return attempt.retry === 'remembered' ? undefined : attempt.retry;
}

export type RetryKind = NonNullable<Attempt['retry']>;

/** A longest side as the name people know it: 1920 is 1080p. */
export function sizeName(side: number): string {
  return side >= 1900 ? '1080p' : side >= 1200 ? '720p' : '480p';
}

/** The words a finished file's note adds when it was made on a retry (empty for a first-try run). */
export function retryNote(retry: RetryKind | undefined, made?: { width: number; height: number }): string {
  switch (retry) {
    case 'resumed':
      return ' (started again after the page was hidden)';
    case 'smaller':
      return " (made at a smaller size, because the device's video encoder stopped at the full size)";
    case 'remembered':
      return made ? ` (made at ${sizeName(Math.max(made.width, made.height))} because the full size failed on this device)` : ' (made smaller because the full size failed on this device)';
    case 'again':
      return " (made on a second try, after the device's video encoder stopped responding)";
    case 'software':
      return " (made with the software video encoder, because the device's hardware encoder stopped)";
    default:
      return '';
  }
}

/** An EncoderUnavailable that only refused this picture size (the browser has an encoder): a smaller size can get past it. */
const sizeRefused = (e: unknown) => nameOf(e) === 'EncoderUnavailable' && !!(e as { sizeRefused?: boolean }).sizeRefused;

const nameOf = (e: unknown) => (typeof e === 'object' && e ? ((e as { name?: string }).name ?? '') : '');

/**
 * Runs `job`, and on a recoverable failure runs it again (each kind of retry once at most).
 * `longestSide` says the longest side of the output the failed try made.
 */
/** How many times a job waits out a hidden page and starts again: a phone switched away from twice in one run is common. */
const MAX_RESUMES = 2;

/**
 * Runs one step of a job (a model download, say) and, when the page was hidden or the browser took a codec back
 * while it ran, waits for the page to come back and runs it again. Other failures are thrown as they came.
 */
export async function resumeWhenHidden<T>(step: () => Promise<T>, hooks: RecoveryHooks): Promise<T> {
  for (let resumed = 0; ; resumed++) {
    try {
      return await step();
    } catch (e) {
      if (FINAL.has(nameOf(e)) || resumed >= MAX_RESUMES || !(hooks.wasHidden() || hooks.reclaimed(e))) throw e;
      await hooks.whenVisible();
      hooks.forgetHidden();
      hooks.onNotice?.('The page was hidden, so this step stopped. Starting it again: keep this tab open and the screen on.');
    }
  }
}

export async function withRecovery<T>(job: (a: Attempt) => Promise<T>, longestSide: () => number, hooks: RecoveryHooks): Promise<T> {
  // A run starts at the smaller size that worked earlier in this tab, if one did; full size is the default.
  const start = hooks.rung?.get();
  const base: Attempt = start ? { maxSide: start, retry: 'remembered', remembered: true } : {};
  let attempt: Attempt = base;
  let resumes = 0;
  let shrunk = false;
  let softened = false;
  for (;;) {
    try {
      const done = await job(attempt);
      // A smaller size reached by a retry is what the next run starts at. A run that worked at full size writes nothing.
      if (attempt.retry === 'smaller' && attempt.maxSide) hooks.rung?.set(attempt.maxSide);
      return done;
    } catch (e) {
      const name = nameOf(e);
      if (FINAL.has(name)) throw e;
      if (resumes < MAX_RESUMES && (hooks.wasHidden() || hooks.reclaimed(e))) {
        resumes++;
        await hooks.whenVisible();
        hooks.forgetHidden();
        hooks.onNotice?.('The page was hidden, so the run stopped. Starting again: keep this tab open and the screen on.');
        attempt = { ...attempt, retry: 'resumed' };
        continue;
      }
      if ((SHRINKABLE.has(name) || name === 'EncoderStall') && !softened && !shrunk && hooks.softwareEncode && (await hooks.softwareEncode())) {
        softened = true;
        hooks.onNotice?.("This device's video encoder stopped. Trying again with the software encoder.");
        attempt = { ...base, retry: 'software' };
        continue;
      }
      const next = (SHRINKABLE.has(name) || sizeRefused(e)) && !shrunk ? smallerSide(longestSide()) : undefined;
      if (next === undefined) {
        // An encoder that gave up on a picture already as small as a retry goes still gets one more try, in real-time mode, at the same size.
        if (name === 'EncoderStall' ? shrunk : !(hooks.sameSizeRetry && AGAIN.has(name)) || shrunk) throw e;
        shrunk = true;
        hooks.onNotice?.(name === 'EncoderStall' ? "This device's video encoder stopped responding. Trying once more." : "This device's video encoder stopped. Trying once more.");
        attempt = { ...base, retry: 'again' };
        continue;
      }
      shrunk = true;
      hooks.onNotice?.(`This device's video encoder stopped at the full size. Trying again at a smaller size (${next} pixels on the longest side).`);
      attempt = { maxSide: next, retry: 'smaller', remembered: base.remembered };
    }
  }
}
