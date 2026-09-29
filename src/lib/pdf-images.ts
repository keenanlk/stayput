/**
 * Pull the pictures embedded in a PDF back out at their stored size. pdf.js
 * decodes every image format a PDF can hold (JPEG, JPEG 2000, Flate, CCITT,
 * JBIG2) and applies soft masks, so what comes out is what the page shows,
 * before it was scaled onto the page.
 */
import type * as PdfJs from 'pdfjs-dist';
import { loadPdfJs } from './pdf';

export interface PdfImage {
  page: number;
  canvas: HTMLCanvasElement;
}

type Decoded = { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray | Uint8Array; kind?: number };

function objectOf(page: PdfJs.PDFPageProxy, id: string): Promise<Decoded | null> {
  const store = id.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((ok) => {
    const timer = setTimeout(() => ok(null), 10_000);
    store.get(id, (obj: Decoded) => {
      clearTimeout(timer);
      ok(obj ?? null);
    });
  });
}

/** Draw one decoded pdf.js image to a canvas. */
export function toCanvas(img: Decoded): HTMLCanvasElement | null {
  const { width, height } = img;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
    return canvas;
  }
  const src = img.data;
  if (!src) return null;
  const out = ctx.createImageData(width, height);
  const px = out.data;
  const n = width * height;
  if (img.kind === 3) px.set(src.subarray(0, n * 4));
  else if (img.kind === 2) {
    for (let i = 0; i < n; i++) {
      px[i * 4] = src[i * 3]!;
      px[i * 4 + 1] = src[i * 3 + 1]!;
      px[i * 4 + 2] = src[i * 3 + 2]!;
      px[i * 4 + 3] = 255;
    }
  } else if (img.kind === 1) {
    // One bit per pixel, rows padded to whole bytes, 1 = white.
    const row = (width + 7) >> 3;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const v = (src[y * row + (x >> 3)]! >> (7 - (x & 7))) & 1 ? 255 : 0;
        const o = (y * width + x) * 4;
        px[o] = px[o + 1] = px[o + 2] = v;
        px[o + 3] = 255;
      }
  } else return null;
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/** A cheap fingerprint: size plus an 8×8 grid of sampled pixels. */
function fingerprint(canvas: HTMLCanvasElement): string {
  const s = document.createElement('canvas');
  s.width = s.height = 8;
  const ctx = s.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  let h = `${canvas.width}x${canvas.height}:`;
  for (let i = 0; i < d.length; i += 4) h += ((d[i]! >> 4) << 12 | (d[i + 1]! >> 4) << 8 | (d[i + 2]! >> 4) << 4 | (d[i + 3]! >> 4)).toString(36) + ',';
  return h;
}

export interface ExtractOptions {
  /** Skip images whose shorter side is below this many pixels (icons, rules, spacers). */
  minSide: number;
  /** Keep only the first copy of an image repeated on several pages (a logo in the header). */
  dedupe: boolean;
  onPage?: (index: number, total: number) => void;
}

export async function extractImages(doc: PdfJs.PDFDocumentProxy, pages: number[], opts: ExtractOptions): Promise<{ images: PdfImage[]; skippedSmall: number; skippedRepeats: number }> {
  const { lib } = await loadPdfJs();
  const paint = new Set([lib.OPS.paintImageXObject, lib.OPS.paintImageXObjectRepeat]);
  const images: PdfImage[] = [];
  const seenIds = new Set<string>();
  const seenPrints = new Set<string>();
  let skippedSmall = 0;
  let skippedRepeats = 0;
  for (const [i, p] of pages.entries()) {
    opts.onPage?.(i, pages.length);
    const page = await doc.getPage(p + 1);
    const ops = await page.getOperatorList();
    for (let k = 0; k < ops.fnArray.length; k++) {
      if (!paint.has(ops.fnArray[k]!)) continue;
      const id = ops.argsArray[k]?.[0];
      if (typeof id !== 'string') continue;
      const key = id.startsWith('g_') ? id : `${p}:${id}`;
      // The same object drawn twice is one picture; shared ('g_') objects repeat across pages.
      if (seenIds.has(key) && (opts.dedupe || !id.startsWith('g_'))) continue;
      seenIds.add(key);
      const obj = await objectOf(page, id);
      if (!obj) continue;
      if (Math.min(obj.width, obj.height) < opts.minSide) {
        skippedSmall++;
        continue;
      }
      const canvas = toCanvas(obj);
      if (!canvas) continue;
      if (opts.dedupe) {
        const f = fingerprint(canvas);
        if (seenPrints.has(f)) {
          skippedRepeats++;
          canvas.width = canvas.height = 0;
          continue;
        }
        seenPrints.add(f);
      }
      images.push({ page: p + 1, canvas });
    }
    page.cleanup();
  }
  return { images, skippedSmall, skippedRepeats };
}
