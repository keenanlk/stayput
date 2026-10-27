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
}

export interface Attempt {
  /** Longest side of the output this try must stay within, when a retry asked for a smaller one. */
  maxSide?: number;
  /** Which kind of retry this is, if it is one. */
  retry?: 'resumed' | 'smaller' | 'again' | 'software';
}

export type RetryKind = NonNullable<Attempt['retry']>;

/** The words a finished file's note adds when it was made on a retry (empty for a first-try run). */
export function retryNote(retry: RetryKind | undefined): string {
  switch (retry) {
    case 'resumed':
      return ' (started again after the page was hidden)';
    case 'smaller':
      return " (made at a smaller size, because the device's video encoder stopped at the full size)";
    case 'again':
      return " (made on a second try, after the device's video encoder stopped responding)";
    case 'software':
      return " (made with the software video encoder, because the device's hardware encoder stopped)";
    default:
      return '';
  }
}

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
  let attempt: Attempt = {};
  let resumes = 0;
  let shrunk = false;
  let softened = false;
  for (;;) {
    try {
      return await job(attempt);
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
        attempt = { retry: 'software' };
        continue;
      }
      const next = SHRINKABLE.has(name) && !shrunk ? smallerSide(longestSide()) : undefined;
      if (next === undefined) {
        // An encoder that gave up on a picture already as small as a retry goes still gets one more try, in real-time mode, at the same size.
        if (name === 'EncoderStall' ? shrunk : !(hooks.sameSizeRetry && AGAIN.has(name)) || shrunk) throw e;
        shrunk = true;
        hooks.onNotice?.(name === 'EncoderStall' ? "This device's video encoder stopped responding. Trying once more." : "This device's video encoder stopped. Trying once more.");
        attempt = { retry: 'again' };
        continue;
      }
      shrunk = true;
      hooks.onNotice?.(`This device's video encoder stopped at the full size. Trying again at a smaller size (${next} pixels on the longest side).`);
      attempt = { maxSide: next, retry: 'smaller' };
    }
  }
}
