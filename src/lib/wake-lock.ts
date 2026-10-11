import { isPhoneBrowser } from './phone-limit';

/**
 * Keeps the screen on while a long video job runs, and notes whether the page
 * went hidden meanwhile. iOS suspends a hidden page and takes its video
 * encoders and decoders back, so a run that was backgrounded cannot finish and
 * fails with whatever the codec threw. The tool shell uses `interruptedError`
 * to say what happened instead.
 *
 * The wake lock is a courtesy: where the API is missing or refused, nothing is
 * shown and the job runs as before.
 */

export interface RunGuard {
  /** The page was hidden at any point since the guard started. */
  wasHidden(): boolean;
  /** Give the screen back and stop listening. Safe to call more than once. */
  release(): void;
}

interface Sentinel {
  released?: boolean;
  release(): Promise<void>;
}

let active: RunGuard | undefined;

/** Whether the page went hidden during the run in progress (false when none is). */
export const pageHiddenDuringRun = (): boolean => active?.wasHidden() ?? false;

export function guardRun(doc: Document = document, nav: Navigator = navigator): RunGuard {
  let hidden = doc.visibilityState === 'hidden';
  let done = false;
  let sentinel: Sentinel | undefined;
  let asking = false;

  const ask = () => {
    const api = (nav as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock;
    if (done || asking || !api || (sentinel && !sentinel.released)) return;
    asking = true;
    api
      .request('screen')
      .then((s) => {
        // The job ended while the request was in flight.
        if (done) void s.release().catch(() => {});
        else sentinel = s;
      })
      .catch((e) => console.debug('Screen wake lock not granted', e))
      .finally(() => (asking = false));
  };

  const onChange = () => {
    if (doc.visibilityState === 'hidden') hidden = true;
    // The system lets the lock go when the page is hidden; ask again on return.
    else ask();
  };
  doc.addEventListener('visibilitychange', onChange);
  if (doc.visibilityState === 'visible') ask();

  const guard: RunGuard = {
    wasHidden: () => hidden,
    release() {
      if (done) return;
      done = true;
      doc.removeEventListener('visibilitychange', onChange);
      void sentinel?.release().catch(() => {});
      sentinel = undefined;
      if (active === guard) active = undefined;
    },
  };
  active = guard;
  return guard;
}

/** A codec the browser took back, or closed under the run, as far as its error tells. */
export function looksReclaimed(e: unknown): boolean {
  // The caption steps wrap a codec's error in a plain message and keep the original as its cause.
  const cause = typeof e === 'object' && e ? (e as { cause?: unknown }).cause : undefined;
  if (cause !== undefined && cause !== e && looksReclaimed(cause)) return true;
  const name = typeof e === 'object' && e ? (e as { name?: string }).name ?? '' : '';
  const text = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (/reclaim|inactiv/i.test(text)) return true;
  return ['InvalidStateError', 'AbortError', 'QuotaExceededError'].includes(name) && /clos|unconfigured|not configured|reclaim|inactiv/i.test(text);
}

/** Failures that say what the visitor gave or asked for, whatever the page was doing. */
const NOT_INTERRUPTION = ['InputError', 'UnreadableFile', 'NoSpeechFound', 'AudioDecodeError'];

/**
 * The error to show when a run failed after the page went hidden, or with a
 * reclaimed codec: say the screen locked or apps switched, how to go on, and
 * that the subtitles are ready when they are. Other errors come back as they
 * were. The name is the only part that is recorded.
 */
export function interruptedError(e: unknown, wasHidden: boolean, action: string, phone = isPhoneBrowser()): unknown {
  if (!(e instanceof Error) || NOT_INTERRUPTION.includes(e.name)) return e;
  const reclaimed = looksReclaimed(e);
  if (!wasHidden && !reclaimed) return e;
  const salvage = (e as { salvage?: unknown[] }).salvage;
  const say = action.trim() || 'the button';
  const lead = phone
    ? 'The screen locked or you switched apps, so your phone paused the conversion.'
    : 'You switched tabs or the screen locked, so the browser paused the conversion.';
  const out = new Error(
    [
      lead,
      salvage?.length ? 'Your subtitles are ready: download the .srt below.' : '',
      `Keep this page open with the screen on, then tap ${say} again. If it stops again, reload the page first.`,
    ]
      .filter(Boolean)
      .join(' '),
  );
  out.name = wasHidden ? 'PageHiddenError' : 'CodecReclaimedError';
  if (salvage) Object.assign(out, { salvage });
  return out;
}

/** The line shown near the run button on phones. */
export const KEEP_SCREEN_ON_HINT = 'Keep the screen on while it works.';
