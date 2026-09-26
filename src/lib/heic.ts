/**
 * HEIC decoding uses heic-to (libheif compiled to WebAssembly, LGPL-3.0).
 * It is served from this site's /vendor/ directory (see vendor.ts) rather
 * than bundled, so the 3 MB decoder only downloads on pages that need it, and
 * the LGPL library stays a separately replaceable module with its licence
 * beside it. The request only fetches the decoder script itself.
 */
import { vendorEntry } from './vendor';

interface HeicModule {
  isHeic(file: Blob): Promise<boolean>;
  heicTo(args: { blob: Blob; type: 'bitmap'; options?: ImageBitmapOptions }): Promise<ImageBitmap>;
  heicTo(args: { blob: Blob; type: string; quality?: number }): Promise<Blob>;
}

let modulePromise: Promise<HeicModule> | undefined;

export function loadHeic(): Promise<HeicModule> {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ vendorEntry('heic')).catch((err) => {
      modulePromise = undefined;
      throw new Error(
        `The HEIC decoder could not be loaded (${err instanceof Error ? err.message : String(err)}). Check your connection and try again.`,
      );
    });
  }
  return modulePromise;
}

export async function decodeHeic(file: Blob): Promise<ImageBitmap> {
  const mod = await loadHeic();
  return mod.heicTo({ blob: file, type: 'bitmap' });
}
