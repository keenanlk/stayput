/**
 * HEIC decoding uses heic-to (libheif compiled to WebAssembly, LGPL-3.0).
 * It is loaded on demand from jsDelivr rather than bundled, so the 3 MB
 * decoder only downloads on pages that need it, and the LGPL library stays
 * a separately replaceable module. No image data is ever sent to the CDN:
 * the request only fetches the decoder script itself.
 *
 * Tests and self-hosted deployments can override the URL by setting
 * `window.STAYPUT_HEIC_URL` before the tool script runs.
 */
export const HEIC_TO_VERSION = '1.5.2';
export const HEIC_TO_URL = `https://cdn.jsdelivr.net/npm/heic-to@${HEIC_TO_VERSION}/dist/csp/heic-to.min.js`;

interface HeicModule {
  isHeic(file: Blob): Promise<boolean>;
  heicTo(args: { blob: Blob; type: 'bitmap'; options?: ImageBitmapOptions }): Promise<ImageBitmap>;
  heicTo(args: { blob: Blob; type: string; quality?: number }): Promise<Blob>;
}

let modulePromise: Promise<HeicModule> | undefined;

declare global {
  interface Window {
    STAYPUT_HEIC_URL?: string;
  }
}

export function loadHeic(): Promise<HeicModule> {
  if (!modulePromise) {
    const url = window.STAYPUT_HEIC_URL ?? HEIC_TO_URL;
    modulePromise = import(/* @vite-ignore */ url).catch((err) => {
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
