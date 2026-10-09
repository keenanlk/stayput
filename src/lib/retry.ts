/** Waits before the second and third attempts at loading the speech model, in milliseconds. */
export const LOAD_BACKOFF_MS = [1000, 3000] as const;

/**
 * Runs `attempt` up to one more time than there are waits, pausing between
 * tries. Only an error `retryable` accepts is tried again; the last error is thrown.
 */
export async function loadWithRetry<T>(attempt: () => Promise<T>, retryable: (e: unknown) => boolean, waits: readonly number[] = LOAD_BACKOFF_MS): Promise<T> {
  for (let n = 0; ; n++) {
    try {
      return await attempt();
    } catch (err) {
      if (n >= waits.length || !retryable(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, waits[n]));
    }
  }
}
