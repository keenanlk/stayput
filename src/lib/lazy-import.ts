/**
 * Loads a page script on demand, and says so plainly when it cannot be had. A chunk that fails to load after a deploy
 * (the page was opened before it, so the chunk it names is gone) is a TypeError whose message differs by browser; it is
 * named AppUpdated, with a Reload link, instead of recording as a bare TypeError. A dropped connection gives the same
 * TypeError and the same advice: reload and run it again.
 */
import { NamedError } from './input-error';

const CHUNK_FAILURE = /dynamically imported module|importing a module script failed|error loading dynamically/i;

export const isChunkLoadFailure = (e: unknown): boolean => e instanceof TypeError && CHUNK_FAILURE.test(e.message);

export const APP_UPDATED_MESSAGE = 'Stayput was updated while this page was open. Reload the page and run it again.';

export async function lazyImport<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (!isChunkLoadFailure(e)) throw e;
    const err = new NamedError('AppUpdated', APP_UPDATED_MESSAGE, { cause: e });
    const href = typeof location !== 'undefined' ? location.pathname : '/';
    return Promise.reject(Object.assign(err, { link: { href, text: 'Reload' } }));
  }
}

/** Start a load at drop time, so the chunk is fetched (and cached by the service worker) while the deployment that served the page is most likely still current. A failure here is left for Run to report. */
export function warm(load: () => Promise<unknown>): void {
  void lazyImport(load).catch(() => {});
}
