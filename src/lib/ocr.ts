/**
 * Read the text in an image, entirely in the browser. Uses Tesseract (the
 * open-source OCR engine, Apache-2.0) compiled to WebAssembly by tesseract.js.
 * The worker, the engine and the English model are served from /vendor/ (see
 * src/data/vendor.json): about 6 MB, fetched the first time Run is pressed and
 * never from a third party. Nothing leaves the tab.
 */
import type { Worker } from 'tesseract.js';
import { vendorDir } from './vendor';

let worker: Promise<Worker> | undefined;

/** tesseract.js resolves these inside its worker, so give it full URLs. */
const abs = (path: string) => new URL(path, location.origin).href.replace(/\/$/, '');

function load(onProgress?: (f: number) => void): Promise<Worker> {
  worker ??= (async () => {
    const { createWorker, OEM } = await import('tesseract.js');
    return createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: abs(`${vendorDir('tesseract')}worker.min.js`),
      corePath: abs(vendorDir('tesseractCore')),
      langPath: abs(vendorDir('tesseractEng')),
      // Same-origin worker script: the site's CSP allows it, and no blob is needed.
      workerBlobURL: false,
      // The service worker caches /vendor/; no second copy in IndexedDB.
      cacheMethod: 'none',
      logger: (m) => {
        if (m.status === 'loading language traineddata' || m.status === 'loading tesseract core') onProgress?.(m.progress);
      },
    });
  })();
  // A failed load (offline on first use, say) may be retried by the next call.
  worker.catch(() => (worker = undefined));
  return worker;
}

/**
 * Small images (a cropped screenshot, a phone photo of one line) read better
 * when enlarged: Tesseract works best with capital letters 20 to 40 px tall.
 */
function prepare(bitmap: ImageBitmap): HTMLCanvasElement {
  const long = Math.max(bitmap.width, bitmap.height);
  const scale = long < 1200 ? 2 : long > 5000 ? 5000 / long : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  // Transparent pixels would otherwise read as black, hiding dark lettering on a cut-out PNG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export interface OcrResult {
  text: string;
  /** Tesseract's mean word confidence, 0 to 100. */
  confidence: number;
}

/** The text in the bitmap. `onProgress` gets 0 to 1 for the one-time download, then for reading. */
export async function readText(
  bitmap: ImageBitmap,
  onProgress?: (stage: 'loading' | 'reading', f: number) => void,
): Promise<OcrResult> {
  onProgress?.('loading', 0);
  const w = await load((f) => onProgress?.('loading', f));
  onProgress?.('reading', 0);
  const { data } = await w.recognize(prepare(bitmap));
  return { text: data.text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(), confidence: data.confidence };
}

/**
 * Join lines that belong to one paragraph, for pasting into a document or an
 * email. Blank lines stay as paragraph breaks, and a word hyphenated across a
 * line break is joined back together.
 */
export function unwrap(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/(\w)-\n(\w)/g, '$1$2').replace(/\s*\n\s*/g, ' '))
    .join('\n\n');
}
