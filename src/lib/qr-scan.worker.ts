/**
 * Reads QR codes and barcodes off the main thread. It gets pixels, never the
 * file, and answers with the decoded results. The decoder is ZXing-C++ built
 * to WebAssembly (zxing-wasm); its wasm is served from this site's /vendor/
 * path, never from a CDN, so no request leaves for another host.
 */
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import { vendorDir } from './vendor';
import type { Hit } from './qr-scan';

export type ScanMode = 'image' | 'live' | 'live-hard';
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
    let hits: Hit[];
    if (mode === 'image') {
      hits = await read(image, IMAGE_PASS_1);
      // A second pass rescued scratched and unevenly lit photos in testing; a third found nothing more.
      if (!hits.some((h) => h.isValid)) {
        const second = await read(image, IMAGE_PASS_2);
        if (second.some((h) => h.isValid) || second.length > hits.length) hits = second;
      }
    } else {
      hits = await read(image, mode === 'live-hard' ? { ...LIVE, tryHarder: true } : LIVE);
    }
    // Hits the reader flagged as invalid carry junk text: only the count leaves the worker.
    const valid = hits.filter((h) => h.isValid);
    reply({ hits: valid, invalid: hits.length - valid.length, ms: performance.now() - started });
  } catch (err) {
    console.warn(err);
    reply({ error: 'read' });
  }
};
