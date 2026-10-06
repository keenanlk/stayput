/**
 * Read the text in an image, entirely in the browser. Uses Tesseract (the
 * open-source OCR engine, Apache-2.0) compiled to WebAssembly by tesseract.js.
 * The worker, the engine and the English model are served from /vendor/ (see
 * src/data/vendor.json): about 6 MB, fetched the first time Run is pressed and
 * never from a third party. Nothing leaves the tab.
 */
import type { Page, Worker } from 'tesseract.js';
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
  const { data } = await w.recognize(prepare(bitmap), {}, { text: true, blocks: true });
  return confidentText(data);
}

/** Words below this confidence (0 to 100) are dropped from a photo's text. Real words on a clean background score 80+; texture reads as 0 to 40. */
const MIN_WORD_CONFIDENCE = 60;

/** A line must hold at least one word of two or more letters or digits at this confidence, or it is noise that happened to match a short word. */
const ANCHOR_CONFIDENCE = 80;

/**
 * Tesseract treats a photo as a page, so a brick wall or foliage comes back as
 * lines of random characters. Keep only the words it is sure of, and drop a
 * line that is left mostly symbols. Clean pages lose nothing: their words all
 * score high, and an untouched line keeps Tesseract's own spacing.
 */
function confidentText(data: Page): OcrResult {
  const blocks: string[] = [];
  const scores: number[] = [];
  for (const block of data.blocks ?? []) {
    const paras: string[] = [];
    for (const para of block.paragraphs) {
      const lines: string[] = [];
      for (const line of para.lines) {
        const kept = line.words.filter((w) => w.text.trim() && w.confidence >= MIN_WORD_CONFIDENCE);
        const text = (kept.length === line.words.length ? line.text : kept.map((w) => w.text.trim()).join(' ')).trim();
        // A real line has letters or digits making up most of it, and a word it is sure of.
        const solid = text.replace(/[^\p{L}\p{N}]/gu, '').length;
        if (solid / (text.replace(/\s/g, '').length || 1) < 0.6 || !kept.some((w) => w.confidence >= ANCHOR_CONFIDENCE && /[\p{L}\p{N}]{2}/u.test(w.text))) continue;
        lines.push(text);
        scores.push(...kept.map((w) => w.confidence));
      }
      if (lines.length) paras.push(lines.join('\n'));
    }
    if (paras.length) blocks.push(paras.join('\n\n'));
  }
  const text = blocks.join('\n\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text, confidence: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0 };
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

export interface OcrWord {
  text: string;
  /** Pixels in the image given, top-left origin. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Height of the word's line, in pixels: a steadier guide to the font size than the word's own box. */
  lineHeight: number;
  /**
   * The line's baseline under the word's left and right edges, in pixels. It
   * keeps every word of a line on one baseline (a word's own box ends lower
   * when it has a descender) and follows a slightly skewed scan.
   */
  baseline?: [number, number];
}

/** Every word Tesseract finds in the canvas, with its box, plus the page's text and mean confidence. */
export async function readWords(
  canvas: HTMLCanvasElement,
  onLoading?: (f: number) => void,
): Promise<OcrResult & { words: OcrWord[] }> {
  const w = await load(onLoading);
  const { data } = await w.recognize(canvas, {}, { text: true, blocks: true });
  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const lineHeight = line.bbox.y1 - line.bbox.y0;
        const b = line.baseline as { x0: number; y0: number; x1: number; y1: number; has_baseline?: boolean } | undefined;
        const at = (x: number) => b!.y0 + ((b!.y1 - b!.y0) * (x - b!.x0)) / (b!.x1 - b!.x0);
        // Trust the baseline only when it is there and runs through the line's box.
        const usable = !!b && b.has_baseline !== false && b.x1 > b.x0 && [b.y0, b.y1].every((y) => Number.isFinite(y) && y > line.bbox.y0 && y <= line.bbox.y1 + 1);
        for (const word of line.words) {
          const text = word.text.trim();
          if (!text || word.confidence <= 20) continue;
          const baseline: [number, number] | undefined = usable ? [at(word.bbox.x0), at(word.bbox.x1)] : undefined;
          words.push({ text, ...word.bbox, lineHeight, baseline });
        }
      }
    }
  }
  return { text: data.text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(), confidence: data.confidence, words };
}
