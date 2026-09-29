/**
 * Crop PDF pages: set each page's crop and media box to a rectangle chosen on
 * the preview, or to the page's own content bounds (white margins trimmed).
 * Page content is not re-rendered, so text stays text; what falls outside the
 * box is hidden by every viewer and printer but still in the file.
 */
import type * as PdfJs from 'pdfjs-dist';
import { displayedToUserSpace, loadDocument, loadPdfLib, renderPage } from './pdf';

export interface CropRect {
  /** Fractions 0..1 of the page as displayed, origin top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The page's content bounds as a CropRect, from a render at `dpi`: the
 * smallest box holding every pixel that is not near-white, plus `margin`
 * (a fraction of the shorter side). Undefined for a blank page.
 */
export async function contentBounds(pdf: PdfJs.PDFDocumentProxy, index: number, margin = 0.02, dpi = 72): Promise<CropRect | undefined> {
  const { canvas } = await renderPage(pdf, index + 1, dpi / 72);
  const { width: W, height: H } = canvas;
  const data = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
  canvas.width = canvas.height = 0;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      const i = row + x * 4;
      // Anti-aliased edges and faint scan noise count as white.
      if (data[i]! < 235 || data[i + 1]! < 235 || data[i + 2]! < 235) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return undefined;
  const m = Math.min(W, H) * margin;
  const left = Math.max(0, x0 - m), top = Math.max(0, y0 - m);
  const right = Math.min(W, x1 + 1 + m), bottom = Math.min(H, y1 + 1 + m);
  return { x: left / W, y: top / H, width: (right - left) / W, height: (bottom - top) / H };
}

/** Apply `rects` (by zero-based page index) and return the cropped PDF. */
export async function cropPdf(source: Uint8Array, rects: Map<number, CropRect>): Promise<Uint8Array> {
  const { PDFName } = await loadPdfLib();
  const doc = await loadDocument(source);
  const pages = doc.getPages();
  for (const [index, r] of rects) {
    const page = pages[index];
    if (!page) continue;
    // Two opposite corners, mapped through the page's rotation into user space.
    const a = displayedToUserSpace(page, r.x, 1 - r.y - r.height);
    const b = displayedToUserSpace(page, r.x + r.width, 1 - r.y);
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    if (w < 1 || h < 1) continue;
    page.setMediaBox(x, y, w, h);
    page.setCropBox(x, y, w, h);
    for (const box of ['TrimBox', 'BleedBox', 'ArtBox']) page.node.delete(PDFName.of(box));
  }
  return doc.save({ useObjectStreams: true, updateFieldAppearances: false });
}
