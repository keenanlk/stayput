/**
 * A no-progress watchdog for the video tools that re-encode. In some browsers
 * the native video encoder can stop answering without any error, and the
 * progress bar then sits still forever. This turns that silence into a clear
 * message. It watches for progress that stops changing, not for total time, so
 * a long encode on a slow device is never cut short while it is still moving.
 */

/*
 * Measured on a throttled phone profile (Pixel 7, 6x slower CPU) with a 170 MB, 2.5 minute
 * 1080p clip at the slowest settings: the longest pause between progress reports was 1.3 s,
 * the first report came at once, and the wait after the last one was under 0.5 s.
 * These limits are about 45 times that.
 */
/** How long progress may stand still, once it has started, before the encoder is called stuck. */
export const STALL_MS = 60_000;
/** How long the first progress report may take (opening the file, starting the encoder). */
export const START_MS = 60_000;

export const STALL_MESSAGE = "This browser's video encoder stopped responding. Try Chrome or Firefox. Mute video doesn't re-encode the picture, so it may still work here.";

/** Thrown when the watchdog fires. The name is the short error kind a failed run records. */
export class EncoderStall extends Error {
  constructor(message = STALL_MESSAGE) {
    super(message);
    this.name = 'EncoderStall';
  }
}

export interface WatchdogLimits {
  /** Milliseconds without a change in progress. Only tests pass this; no tool does. */
  stallMs?: number;
  /** Milliseconds before the first progress report. Only tests pass this; no tool does. */
  startMs?: number;
}

/**
 * Runs `work` and fails with EncoderStall if the progress it reports (by
 * calling the `progress` function it is given) stops changing. On a stall,
 * `cancel` is called to stop the encode and free what it holds. The timer is
 * always cleared when the work ends, however it ends, and on page hide.
 */
export async function watchEncode<T>(work: (progress: (fraction: number) => void) => Promise<T>, cancel: () => unknown, limits: WatchdogLimits = {}): Promise<T> {
  const stallMs = limits.stallMs ?? STALL_MS;
  const startMs = limits.startMs ?? START_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = -Infinity;
  let started = false;
  let fire: (e: EncoderStall) => void = () => {};
  const stalled = new Promise<never>((_, reject) => (fire = reject));
  stalled.catch(() => undefined);
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // A tab in the background is slowed down by the browser, so silence there proves nothing.
      if (typeof document !== 'undefined' && document.hidden) return arm(ms);
      // Say why first: cancelling makes the encode fail too, and this must be the error that is seen.
      fire(new EncoderStall());
      // Cancelling a stuck encoder can itself wait on it, so do not wait for the answer.
      try {
        Promise.resolve(cancel()).catch(() => undefined);
      } catch {
        // Already stopped.
      }
    }, ms);
  };
  const progress = (fraction: number) => {
    if (started && fraction === last) return;
    started = true;
    last = fraction;
    arm(stallMs);
  };
  // A page that is going away has nothing left to watch.
  const stop = () => clearTimeout(timer);
  globalThis.addEventListener?.('pagehide', stop);
  arm(startMs);
  const job = work(progress);
  job.catch(() => undefined);
  try {
    return await Promise.race([job, stalled]);
  } finally {
    stop();
    globalThis.removeEventListener?.('pagehide', stop);
  }
}

/** The pieces of a Mediabunny Conversion this needs. */
interface Runnable {
  onProgress?: ((fraction: number, processedTime: number) => unknown) | undefined;
  execute(): Promise<void>;
  cancel(): Promise<void>;
}

/** Runs a Conversion with the watchdog, passing its progress on to `onProgress`. */
export function executeWatched(conversion: Runnable, onProgress?: (fraction: number) => void, limits?: WatchdogLimits): Promise<void> {
  return watchEncode(
    (progress) => {
      conversion.onProgress = (p) => {
        progress(p);
        onProgress?.(p);
      };
      return conversion.execute();
    },
    () => conversion.cancel(),
    limits,
  );
}
