/**
 * Reads QR codes and barcodes off the main thread. It gets pixels, never the
 * file, and answers with the decoded results. The decoder is ZXing-C++ built
 * to WebAssembly (zxing-wasm); its wasm is served from this site's /vendor/
 * path, never from a CDN, so no request leaves for another host.
 */
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import { vendorDir } from './vendor';
import type { Hit } from './qr-scan';
import { invert, rotate, stretchContrast, upscale, upscaleFactor, type Pixels } from './qr-scan-passes';

/** `tile` is one full-size piece of a photo too big for the first read: fewer passes, because the page sends several. */
export type ScanMode = 'image' | 'tile' | 'live' | 'live-hard';
export type ScanRequest = { id: number; width: number; height: number; data: ArrayBuffer; mode: ScanMode };
export type ScanReply = { id: number; hits?: Hit[]; invalid?: number; ms?: number; error?: 'load' | 'read' };

let loading: Promise<unknown> | undefined;
function prepare(): Promise<unknown> {
  // The default fetches the wasm from a CDN, which the site's policy blocks and the no-upload promise rules out.
  loading ??= prepareZXingModule({
    overrides: { locateFile: (name: string) => vendorDir('zxing') + (name.endsWith('.wasm') ? 'zxing_reader.wasm' : name) },
    fireImmediately: true,
  }).catch((e) => {
    loading = undefined;
    throw e;
  });
  return loading;
}

/** At most 8 are shown; one extra is asked for so the page can say when there were more. */
const SYMBOLS = 9;

const IMAGE_PASS_1: ReaderOptions = { tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: SYMBOLS, returnErrors: true };
const IMAGE_PASS_2: ReaderOptions = { ...IMAGE_PASS_1, binarizer: 'GlobalHistogram', tryDenoise: true };
const LIVE: ReaderOptions = { tryHarder: false, tryRotate: false, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 4, returnErrors: false };

async function read(image: ImageData, options: ReaderOptions): Promise<Hit[]> {
  const results = await readBarcodes(image, options);
  return results.map((r) => ({
    text: r.text,
    format: r.format,
    isValid: r.isValid,
    bytes: r.bytes,
    contentType: r.contentType,
    position: { topLeft: { x: r.position.topLeft.x, y: r.position.topLeft.y } },
  }));
}

self.onmessage = async (e: MessageEvent<ScanRequest>) => {
  const { id, width, height, data, mode } = e.data;
  const reply = (r: Omit<ScanReply, 'id'>) => (self as unknown as Worker).postMessage({ id, ...r } satisfies ScanReply);
  try {
    await prepare();
  } catch (err) {
    console.warn(err);
    return reply({ error: 'load' });
  }
  try {
    const started = performance.now();
    const image = new ImageData(new Uint8ClampedArray(data), width, height);
    let hits: Hit[] = [];
    let invalid = 0;
    // Hits the reader flagged as invalid carry junk text: only the count leaves the worker.
    // Only the first two passes on the untouched pixels may say "a code was found but damaged": stretched, flipped,
    // enlarged and tilted copies of plain noise make junk hits, and those must not turn "no code" into "damaged".
    const attempt = async (pixels: Pixels, options: ReaderOptions, countInvalid = false): Promise<boolean> => {
      const found = await read(pixels.data === image.data ? image : new ImageData(pixels.data, pixels.width, pixels.height), options);
      const valid = found.filter((h) => h.isValid);
      if (countInvalid) invalid = Math.max(invalid, found.length - valid.length);
      if (valid.length > hits.length) hits = valid;
      return valid.length > 0;
    };
    const base: Pixels = { width, height, data: image.data };
    if (mode === 'image' || mode === 'tile') {
      // Pass 1 and 2 as before. Then the same pixels with the contrast stretched, light-on-dark turned over (the
      // reader's own invert option skips most 1D bar codes), enlarged when small, and tilted 12 to 30 degrees.
      const found =
        (await attempt(base, IMAGE_PASS_1, mode === 'image')) ||
        (mode === 'image' && (await attempt(base, IMAGE_PASS_2, true))) ||
        (await attempt(invert(base), IMAGE_PASS_1));
      if (!found && mode === 'image') {
        const stretched = stretchContrast(base);
        const grown = upscaleFactor(width, height);
        const flat = stretched ?? base;
        const passes: (() => Pixels | null)[] = [
          () => stretched,
          () => (stretched ? invert(stretched) : null),
          () => (grown > 1 ? upscale(flat, grown) : null),
          ...(width * height <= 2_500_000 ? [-20, 20, -12, 12, -30, 30].map((a) => () => rotate(flat, a)) : []),
        ];
        for (const make of passes) {
          const px = make();
          if (px && (await attempt(px, IMAGE_PASS_1))) break;
        }
      }
    } else {
      await attempt(base, mode === 'live-hard' ? { ...LIVE, tryHarder: true } : LIVE);
    }
    reply({ hits, invalid, ms: performance.now() - started });
  } catch (err) {
    console.warn(err);
    reply({ error: 'read' });
  }
};
