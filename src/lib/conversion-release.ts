/**
 * Lets a failed run's codecs go before the retry starts. Mediabunny's execute() calls cancel() on an error without
 * waiting for it, so the next try's Conversion could open its decoder and encoder while the old ones were still open;
 * on Android, which has few hardware codec instances, the retry then fails for the old run's sake. Kept free of browser
 * imports so a spec can drive it directly.
 */

/** The longest to wait for cancel(), and the settle time after it when the retry ladder will start another run. */
export const CANCEL_WAIT_MS = 2000;
export const SETTLE_MS = 500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function releaseConversion(
  conversion: { cancel(): Promise<void> } | undefined,
  /** The error is one the ladder retries, so another run follows. */
  retrying: boolean,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  if (!conversion) return;
  let cancelled: Promise<void>;
  try {
    cancelled = Promise.resolve(conversion.cancel()).catch(() => {});
  } catch {
    cancelled = Promise.resolve();
  }
  await Promise.race([cancelled, wait(CANCEL_WAIT_MS)]);
  if (retrying) await wait(SETTLE_MS);
}
