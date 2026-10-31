/**
 * Model downloads that survive a dropped connection: the rest of a file is
 * asked for with a Range request when the host honours one, and otherwise the
 * file is fetched again and the part already received is skipped, a few
 * times at most. A body that still falls short ends as an error, never as a
 * complete file, and a kept file is checked against its size (wholeOrNull).
 *
 * On top of that sits the one loader every model tool uses (loadModelBytes, or
 * downloadVerified where a library keeps the files itself): a model that is not
 * kept is first checked for the connection and for room to keep it, then
 * downloaded and compared with the build-time manifest's size and SHA-256 before
 * it is written to the cache or handed to the model; a kept copy that no longer
 * matches is dropped and fetched again once.
 */
import { NamedError } from './input-error';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Waits before each further try at one file, in milliseconds. */
export const RESUME_BACKOFF_MS = [500, 1500, 3000] as const;

const wait = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** The size a response promises, or 0 when it promises none that can be checked (no length, or a compressed body). */
export function promisedSize(res: Response): number {
  if (res.headers.get('content-encoding')) return 0;
  const n = Number(res.headers.get('content-length'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The full size in a "bytes a-b/total" header, or 0. */
function totalOf(contentRange: string | null): number {
  const n = Number(/\/(\d+)$/.exec(contentRange ?? '')?.[1]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetch `input` as a stream that survives a dropped connection. When the
 * body breaks, or ends short of the size the response promised, the rest is
 * asked for with a Range request and carried on in the same stream; a host
 * that ignores the range sends the file again and the bytes already handed on
 * are skipped. The stream fails, and so is never taken for a whole file, only
 * after `waits` has run out. `onProgress` gets the bytes handed on so far and
 * the size, when it is known.
 *
 * A compressed or chunked response states no size; one is learned from a
 * ranged response's Content-Range, which a host answers with decoded bytes.
 * A response that is not ok is returned as it came.
 */
export async function fetchResumable(
  doFetch: FetchLike,
  input: string,
  init: RequestInit | undefined,
  onProgress?: (got: number, total: number) => void,
  waits: readonly number[] = RESUME_BACKOFF_MS,
): Promise<Response> {
  const first = await doFetch(input, init);
  if (!first.ok || !first.body) return first;
  let total = promisedSize(first);
  let got = 0;
  let retries = 0;
  /** What the current attempt still has to skip: bytes already handed on, when the host sent the file again from its start. */
  let skipping = 0;
  /** Counts what passes, drops what is to be skipped, and hands the rest on. */
  const tap = () =>
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, out) {
        if (skipping > 0) {
          const drop = Math.min(skipping, chunk.byteLength);
          skipping -= drop;
          if (drop === chunk.byteLength) return;
          chunk = chunk.subarray(drop);
        }
        got += chunk.byteLength;
        onProgress?.(got, total);
        out.enqueue(chunk);
      },
    });

  /** The next body to read from, at byte `got`, after a wait; throws once the tries are used up. */
  async function reconnect(): Promise<ReadableStream<Uint8Array>> {
    for (;;) {
      if (retries >= waits.length) throw new TypeError(`Failed to fetch: ${input} stopped at ${got} bytes`);
      await wait(waits[retries++]!);
      try {
        const headers = new Headers(init?.headers);
        if (got > 0) headers.set('Range', `bytes=${got}-`);
        const next = await doFetch(input, { ...init, headers });
        if (!next.ok || !next.body) continue;
        const resumed = next.status === 206 && !next.headers.get('content-encoding') && new RegExp(`^bytes ${got}-`).test(next.headers.get('content-range') ?? '');
        if (next.status === 206 && !resumed) continue;
        total ||= totalOf(next.headers.get('content-range')) || promisedSize(next);
        // A host that ignored the range sent the file from its first byte: drop what was already handed on.
        skipping = resumed ? 0 : got;
        return next.body;
      } catch {
        // Could not reach the host this time; the next pass waits and tries again.
      }
    }
  }

  // The bodies are piped, not read in script, into one TransformStream whose readable side is the
  // body handed back: a reader that stops also stops the pipe.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  void (async () => {
    let source: ReadableStream<Uint8Array> = first.body!;
    try {
      for (;;) {
        try {
          await source.pipeThrough(tap()).pipeTo(writable, { preventClose: true, preventAbort: true });
          // Too few bytes means a cut-short body that closed politely.
          if (total && got < total) throw new TypeError('Failed to fetch: short body');
          break;
        } catch (err) {
          // The consumer stopped reading: nothing more to fetch.
          const w = writable.getWriter();
          const stopped = await w.ready.then(() => false, () => true);
          w.releaseLock();
          if (stopped) throw err;
          source = await reconnect();
        }
      }
      await writable.close();
    } catch (err) {
      await writable.abort(err).catch(() => undefined);
    }
  })();
  const body = readable;
  const headers = new Headers(first.headers);
  headers.delete('content-range');
  return new Response(body, { status: 200, statusText: first.statusText, headers });
}

/**
 * A response to keep or to use from the cache, held whole, or null when its
 * body is not the size it promises (cut short by a dropped download, a failed
 * write or a full disk).
 */
export async function wholeOrNull(res: Response): Promise<Response | null> {
  const total = promisedSize(res);
  try {
    const blob = await res.blob();
    if (total && blob.size !== total) return null;
    if (!total && blob.size === 0 && res.headers.has('content-length') && res.headers.get('content-length') !== '0') return null;
    return new Response(blob, { status: res.status, statusText: res.statusText, headers: res.headers });
  } catch {
    return null;
  }
}

/** What a model file must be: its size in bytes and its SHA-256 as lower-case hex (src/data/model-manifest.json). */
export type ModelEntry = { size: number; sha256: string };

/** The Cache API store for model files that no library keeps itself. */
export const MODEL_CACHE = 'stayput-models-v1';

/** Names a failed run records; the messages are what the page shows. */
export const MODEL_ERRORS = ['ModelDownloadError', 'ModelOffline', 'StorageFull', 'ModelCorrupted'] as const;
export type ModelErrorName = (typeof MODEL_ERRORS)[number];
export const isModelError = (e: unknown): e is NamedError => e instanceof Error && (MODEL_ERRORS as readonly string[]).includes(e.name);

export const modelDownloadError = (what: string, why = 'could not be downloaded.') =>
  new NamedError('ModelDownloadError', `The ${what} ${why} Check your connection, then try again: a download that stopped part way starts over.`);
export const modelOffline = (what: string) =>
  new NamedError('ModelOffline', `The ${what} has not been downloaded to this device yet and you are offline. Connect to the internet once, then try again; after that it works without a connection.`);
export const storageFull = (what: string, needed: number) =>
  new NamedError('StorageFull', `There is not enough free storage on this device to keep the ${what} (${Math.ceil(needed / 1e6)} MB). Free some space, then try again.`);
export const modelCorrupted = (what: string) =>
  new NamedError('ModelCorrupted', `The ${what} downloaded, but it did not pass the check that it is the right file. Check your connection, then try again.`);

const isQuota = (e: unknown) => e instanceof Error && (e.name === 'QuotaExceededError' || /quota/i.test(e.message));

/** True when the browser says the device is offline. */
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** SHA-256 of `bytes` as lower-case hex, or '' where the browser has no SubtleCrypto (a page that is not a secure context). */
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  return Array.from(new Uint8Array(await subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether `blob` is the file the manifest describes: its size, and its hash where the browser can compute one. */
export async function matchesEntry(blob: Blob, entry: ModelEntry | undefined): Promise<boolean> {
  if (!entry) return true;
  if (blob.size !== entry.size) return false;
  const hash = await sha256Hex(await blob.arrayBuffer());
  return !hash || hash === entry.sha256;
}

/**
 * Whether the network answers at all, asked with a plain GET of a tiny same-origin file that the service worker does not keep: some
 * browsers (iOS Safari on Wi-Fi with no internet, WebKit with its offline switch on) leave navigator.onLine at true. Only a
 * request that fails outright counts as offline; one that is merely slow is taken as online.
 */
export async function networkUp(): Promise<boolean> {
  if (typeof location === 'undefined') return true;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    await fetch(`/robots.txt?online=${Date.now()}`, { cache: 'no-store', signal: ctl.signal });
    return true;
  } catch (err) {
    return (err as Error).name === 'AbortError';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Before a model that is not kept is downloaded: offline (the browser says so, or a request for a small file of ours
 * fails) is ModelOffline, with no request for the model made, and less free
 * storage than the model needs is StorageFull, instead of a half-written cache. A browser that cannot say
 * how much room is left is given the benefit of the doubt.
 */
export async function modelPreflight(needBytes: number, what: string, probe: () => Promise<boolean> = networkUp): Promise<void> {
  if (offline() || !(await probe())) throw modelOffline(what);
  try {
    const { quota, usage } = (await navigator.storage?.estimate?.()) ?? {};
    if (quota !== undefined && usage !== undefined && needBytes > 0 && quota - usage < needBytes) throw storageFull(what, needBytes);
  } catch (err) {
    if (isModelError(err)) throw err;
  }
}

/** Bytes still to download of `paths` (each with its size from `sizeOf`), counting those not found in the cache `name`. */
export async function uncachedBytes(name: string, paths: string[], sizeOf: (path: string) => number | undefined): Promise<number> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(name);
  } catch {
    // Private mode may refuse the Cache API: nothing is kept there.
  }
  let need = 0;
  for (const p of paths) {
    const size = sizeOf(p);
    if (size && !(await cache?.match(p).catch(() => undefined))) need += size;
  }
  return need;
}

/**
 * Download `url` as a whole, verified file. A dropped connection is resumed (fetchResumable); the body must be the
 * size and SHA-256 of `entry` before it is returned, and one that is not is downloaded once more before
 * ModelCorrupted. A response that is not ok is returned as it came, for a caller that wants to see a 404.
 * Anything else that goes wrong is ModelDownloadError, or ModelOffline when the browser is offline.
 */
export async function downloadVerified(
  doFetch: FetchLike,
  url: string,
  opts: { what: string; entry?: ModelEntry; onProgress?: (got: number, total: number) => void; init?: RequestInit; waits?: readonly number[] },
): Promise<Response> {
  const { what, entry } = opts;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      // The second try skips the browser's HTTP cache: /models/ is served immutable, so a stale copy there would come back as it was.
      res = await fetchResumable(doFetch, url, attempt > 0 ? { ...opts.init, cache: 'reload' } : opts.init, opts.onProgress, opts.waits);
    } catch {
      throw offline() ? modelOffline(what) : modelDownloadError(what);
    }
    if (!res.ok) return res;
    const whole = await wholeOrNull(res);
    if (!whole) throw offline() ? modelOffline(what) : modelDownloadError(what);
    const blob = await whole.blob();
    if (await matchesEntry(blob, entry)) return new Response(blob, { status: 200, headers: whole.headers });
    if (attempt >= 1) throw modelCorrupted(what);
  }
}

/** Open a Cache API store, or undefined where the browser will not (Safari private mode, a locked-down profile). */
async function open(name: string): Promise<Cache | undefined> {
  try {
    return typeof caches === 'undefined' ? undefined : await caches.open(name);
  } catch {
    return undefined;
  }
}

/**
 * The bytes of a model file for a loader that wants them in memory (MediaPipe, onnxruntime). A kept copy is
 * used when it matches `entry`; one that does not is evicted and the file downloaded again. A download is
 * checked (see downloadVerified) before it is kept or returned. A cache that cannot keep it (full, refused)
 * never stops the run: the bytes in memory are used, and `onKeepFailed` hears why.
 */
export async function loadModelBytes(
  url: string,
  opts: {
    what: string;
    entry?: ModelEntry;
    onProgress?: (fraction: number) => void;
    onKeepFailed?: (err: NamedError) => void;
    doFetch?: FetchLike;
    cacheName?: string;
    waits?: readonly number[];
  },
): Promise<Uint8Array> {
  const { what, entry } = opts;
  const cache = await open(opts.cacheName ?? MODEL_CACHE);
  try {
    const hit = await cache?.match(url);
    if (hit) {
      const blob = await hit.blob();
      if (await matchesEntry(blob, entry)) {
        opts.onProgress?.(1);
        return new Uint8Array(await blob.arrayBuffer());
      }
      // Cut short, flipped bytes or an older file: never used, fetched again below.
      await cache!.delete(url);
    }
  } catch {
    await cache?.delete(url).catch(() => false);
  }
  await modelPreflight(entry?.size ?? 0, what);
  const res = await downloadVerified(opts.doFetch ?? ((i, o) => fetch(i, o)), url, {
    what,
    entry,
    waits: opts.waits,
    onProgress: (got, total) => opts.onProgress?.(Math.min(1, got / (total || entry?.size || got || 1))),
  });
  if (!res.ok) throw modelDownloadError(what, `could not be downloaded (HTTP ${res.status}).`);
  const blob = await res.blob();
  try {
    await cache?.put(url, new Response(blob, { headers: { 'content-length': String(blob.size) } }));
  } catch (err) {
    await cache?.delete(url).catch(() => false);
    if (isQuota(err)) opts.onKeepFailed?.(storageFull(what, blob.size));
  }
  return new Uint8Array(await blob.arrayBuffer());
}

const PERSIST_ASKED = 'stayput-persist-asked';
let persistAsked = false;

/**
 * After a successful run of a tool that keeps a model, ask the browser not to evict the origin's storage
 * (Safari drops idle Cache API data after seven days). Chrome and Safari answer without a prompt; Firefox asks, so it is
 * asked once for this browser and never before a run. Does nothing when no model is kept.
 */
export async function persistAfterRun(keptIn: readonly string[] = [MODEL_CACHE, 'transformers-cache', 'transformers-cache-whisper-tiny']): Promise<void> {
  try {
    if (persistAsked || typeof navigator === 'undefined' || !navigator.storage?.persist || typeof caches === 'undefined') return;
    let kept = false;
    for (const name of keptIn) kept ||= await caches.has(name);
    if (!kept) return;
    persistAsked = true;
    try {
      if (localStorage.getItem(PERSIST_ASKED)) return;
      localStorage.setItem(PERSIST_ASKED, '1');
    } catch {
      // No localStorage: asked once for this page instead.
    }
    if (await navigator.storage.persisted?.()) return;
    await navigator.storage.persist();
  } catch {
    // Storage that cannot be persisted is no failure of the run.
  }
}
