/**
 * Model downloads that survive a dropped connection: the rest of a file is
 * asked for with a Range request when the host honours one, and otherwise the
 * file is fetched again and the part already received is skipped, a few
 * times at most. A body that still falls short ends as an error, never as a
 * complete file, and a kept file is checked against its size (wholeOrNull).
 */

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
