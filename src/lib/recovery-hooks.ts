import type { RecoveryHooks } from './edit-recovery';
import { forgetPageHidden, looksReclaimed } from './wake-lock';
import { rememberWorkingSize, workingSize } from './working-size';

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
      onNotice,
    },
    dispose: () => document.removeEventListener('visibilitychange', note),
  };
}
