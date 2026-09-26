/**
 * The WebAssembly decoders this site serves itself (see src/data/vendor.json
 * and scripts/vendor.mjs). They live under /vendor/<package>@<version>/, so
 * they are same-origin, cached forever, and never fetched from a third party.
 *
 * They are too big to download for every visitor (about 6 MB, 1.8 MB
 * compressed), so the service worker does not precache them. Instead a tool
 * page that can need one fetches it into the cache once the page is idle
 * (`warmDecoders`), which is what makes the tool work offline after one visit.
 */
import vendor from '../data/vendor.json';

export type VendorLib = keyof typeof vendor;

/** The name of the service worker's cache for immutable assets (see src/pages/sw.js.ts). */
export const ASSET_CACHE = 'stayput-assets';

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
  try {
    const bytes = Uint8Array.from(atob(SAMPLES[format]), (c) => c.charCodeAt(0));
    (await createImageBitmap(new Blob([bytes], { type: `image/${format}` }))).close();
    return true;
  } catch {
    return false;
  }
}

/** Which decoders a file input's `accept` list can call for in this browser. */
export async function decodersFor(accept: string): Promise<VendorLib[]> {
  const a = accept.toLowerCase();
  const libs: VendorLib[] = [];
  if (/heic|heif/.test(a)) libs.push('heic');
  for (const f of ['jxl', 'avif'] as const) if (a.includes(f) && !(await decodesNatively(f))) libs.push(f);
  return libs;
}

/**
 * Put the decoders this page may need into the offline cache, once, when the
 * page is idle. Skipped when the visitor asked to save data. Encrypted-PDF
 * support (qpdf) is left to cache on first use: it is rarely needed.
 */
export function warmDecoders(accept: string): void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData || !('caches' in window)) return;
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000));
  idle(async () => {
    try {
      const cache = await caches.open(ASSET_CACHE);
      for (const lib of await decodersFor(accept)) {
        const missing = [];
        for (const url of vendorFiles(lib)) if (!(await cache.match(url))) missing.push(url);
        if (missing.length) await cache.addAll(missing);
      }
    } catch {
      // Offline or storage full: the decoder still loads on demand when a file needs it.
    }
  });
}
