import type { Attempt, RecoveryHooks } from './edit-recovery';
import { isPhoneBrowser } from './phone-limit';
import { sameSizeRung, vp9Offered } from './encoder-probe';
import { forgetPageHidden, looksReclaimed } from './wake-lock';
import { fullSizeChosen, LOST_SIDE, lostRun, noteRiskSize, rememberWorkingSize, workingSize } from './working-size';

/**
 * The page-side half of edit-recovery.ts: whether the page was hidden since the job started, waiting for it to come
 * back, and telling the run's guard that the job started over. `dispose` stops listening; call it when the job ends.
 */
export function pageRecoveryHooks(onNotice?: (message: string) => void): { hooks: RecoveryHooks; dispose(): void } {
  let hidden = typeof document !== 'undefined' && document.hidden;
  const note = () => {
    if (document.hidden) hidden = true;
  };
  document.addEventListener('visibilitychange', note);
  return {
    hooks: {
      wasHidden: () => hidden,
      forgetHidden: () => {
        hidden = false;
        forgetPageHidden();
      },
      whenVisible: () =>
        document.hidden
          ? new Promise<void>((done) => {
              const back = () => {
                if (document.hidden) return;
                document.removeEventListener('visibilitychange', back);
                done();
              };
              document.addEventListener('visibilitychange', back);
            })
          : Promise.resolve(),
      reclaimed: looksReclaimed,
      rung: { get: workingSize, set: rememberWorkingSize },
      firstRung: sameSizeRung,
      vp9: vp9Offered,
      onNotice,
    },
    dispose: () => document.removeEventListener('visibilitychange', note),
  };
}

/** A source longer than this on its longest side (past 1440p) is 4K for this purpose. */
const AT_RISK_SOURCE = 2560;

/** Phones that report 3 GB of memory or less (Chromium on Android; Safari does not say) start a 4K source at 720p, not 1080p. */
const lowMemory = (): boolean => {
  const gb = (navigator as { deviceMemory?: unknown }).deviceMemory;
  return typeof gb === 'number' && gb <= 3;
};

/**
 * Full size stays the default. The exceptions that need no failure first, all on a phone detected here (user agent and touch, nothing sent
 * anywhere): a 4K source in compress, reverse, merge or the caption redraw starts at 1080p (720p when the phone reports 3 GB of memory
 * or less), and the file's note says so. With `afterLostRun` (the caption redraw), a tab that was closed by the browser mid-run earlier
 * starts any source over 720p at 720p. "Try full size" turns all of it off.
 */
export function capAtRisk(attempt: Attempt, sourceLongest: number, afterLostRun = false): void {
  if (attempt.maxSide || !isPhoneBrowser() || fullSizeChosen()) return;
  if (afterLostRun && lostRun() && sourceLongest > LOST_SIDE) {
    attempt.maxSide = LOST_SIDE;
    attempt.retry = 'lost';
    return;
  }
  if (sourceLongest <= AT_RISK_SOURCE) return;
  const side = lowMemory() ? 1280 : 1920;
  attempt.maxSide = side;
  attempt.retry = 'atrisk';
  noteRiskSize(side);
}
