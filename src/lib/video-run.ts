/**
 * The shared wrapper for a re-encoding video tool: the run goes through withRecovery (resume after a hidden page, the same-size
 * setting, a smaller picture, the remembered size), the encoder is told this try's latency, a file the phone could not read is
 * named, and any bare error leaves with the name of the tool's step. Compress, reverse, merge and trim wrote the same
 * lines out by hand; the tools added after them call this.
 */
import { withRecovery, retryOf, type Attempt, type RetryKind } from './edit-recovery';
import { encodeRun } from './encoder-probe';
import { pageRecoveryHooks } from './recovery-hooks';
import { isNotReadable, notReadable } from './read-failure';
import { memoryRange, nameBare } from './bare-error';

/**
 * Runs `job` until it works or the ladder is used up. `job` calls `sized(longestSide)` once it knows the size of the picture it
 * writes, so a failure can be retried one step smaller, and reads `attempt` for the size cap and encoder settings.
 * The result carries `retry` when the file was made on a retry or at the size remembered from earlier in the tab.
 */
export async function runRecovered<T extends object>(
  step: string,
  onNotice: ((message: string) => void) | undefined,
  job: (attempt: Attempt, sized: (longestSide: number) => void) => Promise<T>,
): Promise<T & { retry?: RetryKind }> {
  const page = pageRecoveryHooks(onNotice);
  let made = 0;
  try {
    return await withRecovery(
      async (attempt) => {
        const done = encodeRun(attempt);
        try {
          const r = await job(attempt, (side) => (made = side));
          const retry = retryOf(attempt);
          return retry ? { ...r, retry } : r;
        } catch (e) {
          if (isNotReadable(e)) throw notReadable(e);
          throw nameBare(step, memoryRange(e));
        } finally {
          done();
        }
      },
      () => made,
      page.hooks,
    );
  } finally {
    page.dispose();
  }
}
