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
 * The order of an encoder failure's retries (each kind once, at most MAX_RUNS runs in all, the first included):
 *  1. the same size with another encoder setting for this run only: real-time latency on WebKit, the software encoder on Chromium;
 *  2. a smaller picture (1920, 1280, 854 on the longest side);
 *  3. VP9 in the same MP4, Chromium only, last because older iPhones cannot play it.
 * Anything else is thrown as it came, with its own name; an encoder that is still failing after the ladder ends as EncoderGaveUp.
 */

import { codecFailure } from './codec-guard';

/** Errors that say what the file is, or what the person gave: a retry cannot change them. */
const FINAL = new Set(['InputError', 'UnreadableFile', 'UnreadableFileGone', 'UnreadableContainer', 'NoVideoTrack', 'UnknownDuration', 'UnsupportedCodec', 'AudioDecodeError', 'UnsupportedSound', 'UnsupportedAudioCodec', 'NoSoundTrack', 'ConversionInvalid', 'EditUnsupported', 'NoSpeechFound', 'DecodeFailed']);

/**
 * What the shell stops an instant repeat of: FINAL, plus the other names that say the file itself cannot be used
 * (a picture that will not decode, a container nothing here opens). Same file and same options fail the same way.
 * 'FileNotDownloaded' is left out on purpose: a cloud-only file can read fine on the very next try once the device has finished fetching it.
 * 'UnsupportedContainer' and 'FileNotDownloaded' are the names intake.ts gives (see IntakeProblem).
 */
const SAME_EVERY_TIME = new Set([...FINAL, 'PictureUnreadable', 'UnsupportedContainer', 'NoVideoTrack', 'NoPicture', 'SideBySideTooBig', 'PictureWithoutVideo', 'NoVideo', 'TooManyPictures', 'PictureBackgroundMissing']);
export function failsTheSameAgain(name: string): boolean {
  return SAME_EVERY_TIME.has(name);
}

/** Encoder and memory failures that a smaller picture can get past. */
const SHRINKABLE = new Set(['EncodingError', 'OperationError', 'InvalidStateError', 'NotSupportedError', 'EncoderStall', 'OutOfMemoryError', 'EncoderRefused', 'CanvasMemoryError']);


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
  /** The same-size setting to retry an encoder failure with (see EncodeRung), or undefined when this browser has none; then the first retry is a smaller picture. */
  firstRung?(): EncodeRung | undefined | Promise<EncodeRung | undefined>;
  /** Whether this browser can write VP9 in MP4 and should be asked to as the last rung (Chromium only). */
  vp9?(): boolean | Promise<boolean>;
  /** Said to the person just before a second try. */
  onNotice?(message: string): void;
  /** The smaller size that last worked in this tab: a run starts there, and a retry that works at a smaller size is kept for the next run. */
  rung?: { get(): number | undefined; set(side: number): void };
}

/** Encoder settings one run is made with. Per run, so one tool's retry does not change the next run (the page-wide realtimeOnly flag does). */
export interface EncodeRung {
  latencyMode?: 'realtime';
  hardwareAcceleration?: 'prefer-software';
}

/** The options a run's video track is made with for this attempt; spread into Mediabunny's video options. */
export function encodeOptions(attempt: Attempt): EncodeRung {
  return {
    ...(attempt.latencyMode ? { latencyMode: attempt.latencyMode } : {}),
    ...(attempt.hardwareAcceleration ? { hardwareAcceleration: attempt.hardwareAcceleration } : {}),
  };
}

/** The part of encodeOptions that Mediabunny's Conversion passes on to the encoder (it drops latencyMode; see encodeRun in encoder-probe.ts). */
export function hardwareOption(attempt: Attempt): Pick<EncodeRung, 'hardwareAcceleration'> {
  return attempt.hardwareAcceleration ? { hardwareAcceleration: attempt.hardwareAcceleration } : {};
}

export interface Attempt extends EncodeRung {
  /** Longest side of the output this try must stay within, when a retry asked for a smaller one. */
  maxSide?: number;
  /** Write VP9 instead of H.264 (the last rung, Chromium only). */
  vp9?: boolean;
  /**
   * Which kind of retry this is, if it is one. 'probed': the test encode at the real size failed, so the run starts smaller;
   * 'atrisk': a phone with a 4K source starts at 1080p (720p with 3 GB of memory or less);
   * 'lost': the browser closed the page during a caption run earlier in this tab, so the redraw starts at 720p.
   */
  retry?: 'resumed' | 'smaller' | 'again' | 'software' | 'remembered' | 'probed' | 'atrisk' | 'lost' | 'vp9';
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

/** What the codec probe found at the real size (see planVideoCodec): a smaller longest side and/or encoder settings that answer. */
export interface ProbePlan extends EncodeRung {
  maxSide?: number;
}

/**
 * Takes the probe's findings into this try. Returns the scale (at most 1) to apply to the output size. A smaller size found by the
 * probe is said in the file's note ('probed'); settings alone change nothing the person needs told.
 */
export function adoptPlan(attempt: Attempt, plan: ProbePlan, longest: number): number {
  if (plan.latencyMode) attempt.latencyMode = plan.latencyMode;
  if (plan.hardwareAcceleration) attempt.hardwareAcceleration = plan.hardwareAcceleration;
  if (plan.maxSide && plan.maxSide < longest - 1) {
    attempt.maxSide = Math.min(attempt.maxSide ?? plan.maxSide, plan.maxSide);
    attempt.retry ??= 'probed';
  }
  return capScale(attempt, longest);
}

/** The retry kind a finished file's note is about: a size cap that took effect from the start is said even when the page was hidden or the encoder retried on the way. */
export function retryOf(attempt: Attempt): RetryKind | undefined {
  if (attempt.remembered && attempt.capped && attempt.retry !== 'smaller') return 'remembered';
  if ((attempt.retry === 'probed' || attempt.retry === 'atrisk' || attempt.retry === 'lost') && !attempt.capped) return undefined;
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
    case 'probed':
      return made ? ` (made at ${sizeName(Math.max(made.width, made.height))} because the full size failed on this device)` : ' (made smaller because the full size failed on this device)';
    case 'atrisk':
      return made ? ` (made at ${sizeName(Math.max(made.width, made.height))} because 4K is heavy for this device; use Try full size to keep 4K)` : ' (made smaller because 4K is heavy for this device)';
    case 'lost':
      return made ? ` (made at ${sizeName(Math.max(made.width, made.height))} because the browser closed this page during the last run, most likely out of memory; use Try full size to keep the original size)` : ' (made smaller because the browser closed this page during the last run, most likely out of memory; use Try full size to keep the original size)';
    case 'vp9':
      return ' (made as VP9 video, which plays in Chrome, Firefox and Android but not on older iPhones)';
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

/** Whether the retry ladder takes this error on (a smaller or different run follows). */
export const isShrinkable = (e: unknown) => SHRINKABLE.has(nameOf(e));

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

/** The most runs an encoder failure can cause, the first included, so a phone that cannot encode is not run to exhaustion. */
export const MAX_RUNS = 3;

/** Shown when the encoder is still failing after every rung of the ladder. The name is the error kind a failed run records. */
export class EncoderGaveUp extends Error {
  constructor(options?: ErrorOptions) {
    super("This device's video encoder stopped, even after trying again. Try a shorter clip or a smaller size, a recent Chrome, Edge or Safari, or a computer. Nothing was uploaded.", options);
    this.name = 'EncoderGaveUp';
  }
}

/** Encoder errors a browser names itself; they end as EncoderGaveUp so no bare EncodingError or OperationError reaches the result. */
const BARE_ENCODER = new Set(['EncodingError', 'OperationError', 'NotSupportedError']);

export async function withRecovery<T>(job: (a: Attempt) => Promise<T>, longestSide: () => number, hooks: RecoveryHooks): Promise<T> {
  // A run starts at the smaller size that worked earlier in this tab, if one did; full size is the default.
  const start = hooks.rung?.get();
  const base: Attempt = start ? { maxSide: start, retry: 'remembered', remembered: true } : {};
  let attempt: Attempt = base;
  let resumes = 0;
  let runs = 0;
  const tried = new Set<'config' | 'smaller' | 'vp9'>();
  for (;;) {
    try {
      runs++;
      const done = await job(attempt);
      // A smaller size reached by a retry is what the next run starts at. A run that worked at full size writes nothing.
      if ((attempt.retry === 'smaller' || attempt.retry === 'probed') && attempt.maxSide) hooks.rung?.set(attempt.maxSide);
      return done;
    } catch (e) {
      const name = nameOf(e);
      if (FINAL.has(name)) throw e;
      if (resumes < MAX_RESUMES && (hooks.wasHidden() || hooks.reclaimed(e))) {
        resumes++;
        runs--;
        await hooks.whenVisible();
        hooks.forgetHidden();
        hooks.onNotice?.('The page was hidden, so the run stopped. Starting again: keep this tab open and the screen on.');
        attempt = { ...attempt, retry: 'resumed' };
        continue;
      }
      if (!SHRINKABLE.has(name) && !sizeRefused(e)) throw e;
      // An InvalidStateError is a codec the browser took back: it gets its own name from codec-guard.ts.
      const giveUp = () => (name === 'InvalidStateError' ? (codecFailure(e) ?? e) : BARE_ENCODER.has(name) ? new EncoderGaveUp({ cause: e }) : e);
      if (runs >= MAX_RUNS) throw giveUp();
      const memory = name === 'OutOfMemoryError';
      // 1. The same size with the setting that answers where the default one gives up (not for memory, which a setting cannot fix).
      const rung = !memory && !tried.has('config') ? await hooks.firstRung?.() : undefined;
      if (rung) {
        tried.add('config');
        hooks.onNotice?.(rung.hardwareAcceleration ? "This device's video encoder stopped. Trying again with the software encoder." : "This device's video encoder stopped responding. Trying once more.");
        attempt = { ...base, ...rung, retry: rung.hardwareAcceleration ? 'software' : 'again' };
        continue;
      }
      // 2. A smaller picture, keeping any setting already tried.
      const next = !tried.has('smaller') ? smallerSide(longestSide()) : undefined;
      if (next !== undefined) {
        tried.add('smaller');
        hooks.onNotice?.(`This device's video encoder stopped at the full size. Trying again at a smaller size (${next} pixels on the longest side).`);
        attempt = { ...encodeOptions(attempt), maxSide: next, retry: 'smaller', remembered: base.remembered };
        continue;
      }
      // A stalled encoder that has had nothing else tried, with no setting on offer and no smaller picture, still gets one try in real-time mode at the same size.
      if (name === 'EncoderStall' && !tried.size) {
        tried.add('config');
        hooks.onNotice?.("This device's video encoder stopped responding. Trying once more.");
        attempt = { ...base, latencyMode: 'realtime', retry: 'again' };
        continue;
      }
      // 3. VP9 in the same MP4, last (not for a stall: a silent encoder is WebKit's, which has no VP9 to move to).
      if (!memory && name !== 'EncoderStall' && !tried.has('vp9') && hooks.vp9 && (await hooks.vp9())) {
        tried.add('vp9');
        hooks.onNotice?.("This device's video encoder stopped. Trying once more with a different video format.");
        attempt = { ...(attempt.maxSide ? { maxSide: attempt.maxSide } : {}), vp9: true, retry: 'vp9', remembered: base.remembered };
        continue;
      }
      throw giveUp();
    }
  }
}
