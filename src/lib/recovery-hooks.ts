import type { Attempt, RecoveryHooks } from './edit-recovery';
import { isPhoneBrowser } from './phone-limit';
import { sameSizeRung, vp9Offered } from './encoder-probe';
import { forgetPageHidden, looksReclaimed } from './wake-lock';
import { fullSizeChosen, noteRiskSize, rememberWorkingSize, workingSize } from './working-size';

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

/**
 * Full size stays the default. The one exception that needs no failure first: a phone detected here (user agent and touch, nothing sent
 * anywhere) given a 4K source in compress, reverse or merge starts at 1080p, and the file's note says so. "Try full size" turns it off.
 */
export function capAtRisk(attempt: Attempt, sourceLongest: number): void {
  if (attempt.maxSide || sourceLongest <= AT_RISK_SOURCE || !isPhoneBrowser() || fullSizeChosen()) return;
  attempt.maxSide = 1920;
  attempt.retry = 'atrisk';
  noteRiskSize();
}
