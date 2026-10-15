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
 * Anything else, and a second failure, is thrown as it came, with its own name.
 */

/** Errors that say what the file is, or what the person gave: a retry cannot change them. */
const FINAL = new Set(['InputError', 'UnreadableFile', 'AudioDecodeError', 'NoSoundTrack', 'ConversionInvalid', 'EditUnsupported', 'NoSpeechFound']);

/** Encoder and memory failures that a smaller picture can get past. */
const SHRINKABLE = new Set(['EncodingError', 'OperationError', 'InvalidStateError', 'NotSupportedError', 'EncoderStall', 'OutOfMemoryError', 'EncoderRefused']);

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
  /** Said to the person just before a second try. */
  onNotice?(message: string): void;
}

export interface Attempt {
  /** Longest side of the output this try must stay within, when a retry asked for a smaller one. */
  maxSide?: number;
  /** Which kind of retry this is, if it is one. */
  retry?: 'resumed' | 'smaller';
}

const nameOf = (e: unknown) => (typeof e === 'object' && e ? ((e as { name?: string }).name ?? '') : '');

/**
 * Runs `job`, and on a recoverable failure runs it again (each kind of retry once at most).
 * `longestSide` says the longest side of the output the failed try made.
 */
export async function withRecovery<T>(job: (a: Attempt) => Promise<T>, longestSide: () => number, hooks: RecoveryHooks): Promise<T> {
  let attempt: Attempt = {};
  let resumed = false;
  let shrunk = false;
  for (;;) {
    try {
      return await job(attempt);
    } catch (e) {
      const name = nameOf(e);
      if (FINAL.has(name)) throw e;
      if (!resumed && (hooks.wasHidden() || hooks.reclaimed(e))) {
        resumed = true;
        await hooks.whenVisible();
        hooks.forgetHidden();
        hooks.onNotice?.('The page was hidden, so the run stopped. Starting again: keep this tab open and the screen on.');
        attempt = { ...attempt, retry: 'resumed' };
        continue;
      }
      const next = SHRINKABLE.has(name) && !shrunk ? smallerSide(longestSide()) : undefined;
      if (next === undefined) throw e;
      shrunk = true;
      hooks.onNotice?.(`This device's video encoder stopped at the full size. Trying again at a smaller size (${next} pixels on the longest side).`);
      attempt = { maxSide: next, retry: 'smaller' };
    }
  }
}
