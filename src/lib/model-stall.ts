/**
 * Downloads a model file for a worker, giving up when no bytes arrive for `stallMs` (a connection that stalls on mobile
 * data would otherwise wait forever with the progress text frozen). Free of browser-only imports so workers can use it.
 */
import { NamedError } from './input-error';
import { fetchResumable, wholeOrNull } from './model-fetch';

/** How long a download may go without a single byte before it is called stalled. */
export const MODEL_STALL_MS = 45_000;

export async function fetchModelBytes(url: string, what: string, onProgress: (f: number) => void, stallMs = MODEL_STALL_MS): Promise<Uint8Array> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stalled = false;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      ctl.abort();
    }, stallMs);
  };
  const stall = () => new NamedError('ModelDownloadStalled', `Downloading the ${what} stalled: nothing arrived for ${Math.round(stallMs / 1000)} seconds. Check your internet connection, then try again.`);
  arm();
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok || !res.body) throw new NamedError('ModelDownloadError', `The ${what} could not be downloaded (HTTP ${res.status}). Check your connection and try again.`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      parts.push(value);
      got += value.length;
      if (total) onProgress(Math.min(1, got / total));
    }
    const bytes = new Uint8Array(got);
    let o = 0;
    for (const p of parts) {
      bytes.set(p, o);
      o += p.length;
    }
    return bytes;
  } catch (e) {
    throw stalled ? stall() : e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Like fetchModelBytes, for a model file whose exact size is known: a dropped connection is carried on (a Range request,
 * or skipping what was already received), a body that ends short or is the wrong size is refused rather than handed to
 * the model loader, and a download that gets no byte for `stallMs` is ModelDownloadStalled. Every other failure to fetch
 * is ModelDownloadError.
 */
export async function fetchModelResumable(url: string, what: string, expectedBytes: number, onProgress: (f: number) => void, stallMs = MODEL_STALL_MS): Promise<Uint8Array> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectStall!: (e: Error) => void;
  const stalled = new Promise<never>((_, reject) => (rejectStall = reject));
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      rejectStall(new NamedError('ModelDownloadStalled', `Downloading the ${what} stalled: nothing arrived for ${Math.round(stallMs / 1000)} seconds. Check your internet connection, then try again.`));
      ctl.abort();
    }, stallMs);
  };
  const failed = (why: string) => new NamedError('ModelDownloadError', `The ${what} ${why} Check your connection and try again.`);
  const download = async (): Promise<Uint8Array> => {
    let res: Response;
    try {
      res = await fetchResumable((i, o) => fetch(i, { ...o, signal: ctl.signal }), url, undefined, (got, total) => {
        arm();
        onProgress(Math.min(1, got / (total || expectedBytes)));
      });
    } catch {
      throw failed('could not be downloaded.');
    }
    if (!res.ok) throw failed(`could not be downloaded (HTTP ${res.status}).`);
    const whole = await wholeOrNull(res);
    if (!whole) throw failed('download stopped short.');
    const bytes = new Uint8Array(await whole.arrayBuffer());
    if (bytes.length !== expectedBytes) throw failed('file is not the expected size.');
    return bytes;
  };
  arm();
  try {
    const pending = download();
    // If the stall wins the race, a later failure of the download itself is not an unhandled rejection.
    pending.catch(() => undefined);
    return await Promise.race([pending, stalled]);
  } finally {
    clearTimeout(timer);
  }
}
