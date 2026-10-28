/**
 * Downloads a model file for a worker, giving up when no bytes arrive for `stallMs` (a connection that stalls on mobile
 * data would otherwise wait forever with the progress text frozen). Free of browser-only imports so workers can use it.
 */
import { NamedError } from './input-error';

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
  const stall = () => new NamedError('ModelDownloadStalled', `The ${what} download stalled: no data arrived for ${Math.round(stallMs / 1000)} seconds. Check your connection and try again.`);
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
