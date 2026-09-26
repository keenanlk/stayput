/**
 * The WebAssembly decoders this site serves itself (see src/data/vendor.json
 * and scripts/vendor.mjs). They live under /vendor/<package>@<version>/, so
 * they are same-origin, cached forever, and never fetched from a third party.
 *
 * They are too big to download for every visitor (about 6 MB, 1.8 MB
 * compressed), so the service worker does not precache them. Instead a tool
 * page that can need one asks the service worker to cache it
 * (`warmDecoders`), which is what makes the tool work offline after one visit.
 * The worker does the download so it finishes even if the visitor moves on to
 * another page, and it reports back, so the page (and the tests) know when the
 * decoders are ready offline: `<html data-decoders>` goes from "caching" to
 * "cached", or to "failed" with the reason in `data-decoders-error`.
 */
import vendor from '../data/vendor.json';

export type VendorLib = keyof typeof vendor;

export function vendorDir(lib: VendorLib): string {
  const { package: pkg, version } = vendor[lib];
  return `/vendor/${pkg.replace(/^@/, '').replace('/', '-')}@${version}/`;
}

/** Absolute URLs of every file a decoder needs at runtime (its licence text excluded). */
export function vendorFiles(lib: VendorLib): string[] {
  return Object.keys(vendor[lib].files)
    .filter((f) => f !== 'LICENSE')
    .map((f) => vendorDir(lib) + f);
}

export function vendorEntry(lib: VendorLib): string {
  return vendorDir(lib) + vendor[lib].entry;
}

/* 1x1 images used to ask the browser whether it decodes a format natively. */
const SAMPLES: Record<'jxl' | 'avif', string> = {
  jxl: '/woAELASCAgQADAASxiLFcJJQR5ApH9/',
  avif: 'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUEAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAACAAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgSAAAAAAABNjb2xybmNseAACAAIAAIAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAChtZGF0EgAKBzgABhAgIAkyExAAAAAP+j9adAx6kYPdyns2ULA=',
};

async function decodesNatively(format: 'jxl' | 'avif'): Promise<boolean> {
  const bytes = Uint8Array.from(atob(SAMPLES[format]), (c) => c.charCodeAt(0));
  const probe = createImageBitmap(new Blob([bytes], { type: `image/${format}` })).then(
    (bitmap) => (bitmap.close(), true),
    () => false,
  );
  // A probe that never settles must not hold up caching; assume no native decoder.
  return Promise.race([probe, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000))]);
}

/** Which decoders a file input's `accept` list can call for in this browser. */
export async function decodersFor(accept: string): Promise<VendorLib[]> {
  const a = accept.toLowerCase();
  const wasm = (['jxl', 'avif'] as const).filter((f) => a.includes(f));
  const native = await Promise.all(wasm.map(decodesNatively));
  return [...(/heic|heif/.test(a) ? (['heic'] as const) : []), ...wasm.filter((_, i) => !native[i])];
}

interface WarmReply {
  ok: boolean;
  error?: string;
}

/**
 * Ask the service worker to put the decoders this page may need into the
 * offline cache. Starts soon after load (on idle, at most a few seconds
 * later). Skipped when the visitor asked to save data, and without a service
 * worker (nothing would work offline anyway). Encrypted-PDF support (qpdf) is
 * left to cache on first use: it is rarely needed.
 */
export function warmDecoders(accept: string): void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData || !('serviceWorker' in navigator)) return;
  const html = document.documentElement;
  const run = async () => {
    const urls = (await decodersFor(accept)).flatMap(vendorFiles);
    if (!urls.length) {
      html.dataset.decoders = 'none';
      return;
    }
    html.dataset.decoders = 'caching';
    const reg = await navigator.serviceWorker.ready;
    const reply = await new Promise<WarmReply>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e: MessageEvent<WarmReply>) => resolve(e.data);
      reg.active?.postMessage({ type: 'cache-decoders', urls }, [channel.port2]);
    });
    if (reply.ok) html.dataset.decoders = 'cached';
    else fail(reply.error ?? 'unknown error');
  };
  const fail = (reason: string) => {
    // Not fatal: the decoder still loads on demand when a file needs it, and the next visit retries.
    html.dataset.decoders = 'failed';
    html.dataset.decodersError = reason;
  };
  const start = () => void run().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
  if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 1000);
}
