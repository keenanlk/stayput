/**
 * Make a scanned PDF searchable: each page is rendered with pdf.js, read with
 * Tesseract (src/lib/ocr.ts), and the words are written back over the page as
 * invisible text (render mode 3) in the places they were found. The page
 * looks exactly as before, but the words can be searched, selected and copied,
 * the same thing Acrobat's "Recognize text" and ocrmypdf do.
 */
import type * as PdfLib from 'pdf-lib';
import { closePdfJs, getTextContent, loadDocument, loadPdfLib, openWithPdfJs } from './pdf';
import { readWords } from './ocr';
import { placeWords, winAnsi } from './ocr-layer';

export interface OcrPdfOptions {
  /** Read pages that already have text too, instead of leaving them as they are. */
  redo: boolean;
}

export interface OcrPdfResult {
  bytes: Uint8Array;
  pages: number;
  /** Pages read by OCR. */
  read: number;
  /** Pages left alone because they already had text. */
  skipped: number;
  words: number;
  /** Mean Tesseract confidence over the pages read, 0 to 100. */
  confidence: number;
  /** The recognised text, page by page. */
  text: string;
}

/** 300 dpi is what OCR engines are tuned for; very large pages are capped so a poster does not exhaust memory. */
const DPI = 300;
const MAX_SIDE = 3600;
/** A page with fewer characters than this is treated as a scan (a stray page number is not a text layer). */
const HAS_TEXT = 20;

export async function ocrPdf(
  source: Uint8Array,
  opts: OcrPdfOptions,
  onProgress?: (message: string, fraction: number) => void,
): Promise<OcrPdfResult> {
  const lib = await loadPdfLib();
  const [js, out] = await Promise.all([openWithPdfJs(source), loadDocument(source)]);
  try {
    const font = await out.embedFont(lib.StandardFonts.Helvetica);
    const pages = out.getPages();
    const total = Math.min(js.numPages, pages.length);
    let read = 0;
    let skipped = 0;
    let words = 0;
    let confidence = 0;
    const text: string[] = [];
    for (let i = 0; i < total; i++) {
      const page = await js.getPage(i + 1);
      const at = (f: number) => (i + f) / total;
      if (!opts.redo) {
        const content = await getTextContent(page);
        const chars = content.items.reduce((n, it) => n + ('str' in it ? it.str.replace(/\s/g, '').length : 0), 0);
        if (chars >= HAS_TEXT) {
          skipped++;
          page.cleanup();
          continue;
        }
      }
      onProgress?.(`Page ${i + 1} of ${total}: rendering`, at(0));
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(DPI / 72, MAX_SIDE / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available in this browser.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();
      onProgress?.(`Page ${i + 1} of ${total}: reading the text`, at(0.2));
      const result = await readWords(canvas, (f) => onProgress?.(`Downloading the text reader (${Math.round(f * 100)}%)`, at(0.2 * f)));
      canvas.width = canvas.height = 0;
      const clean = result.words.map((w) => ({ ...w, text: winAnsi(w.text) })).filter((w) => w.text.trim());
      const placed = placeWords(
        clean,
        (x, y) => viewport.convertToPdfPoint(x, y) as [number, number],
        (t, size) => font.widthOfTextAtSize(t, size),
      );
      if (placed.length) writeLayer(lib, out, pages[i]!, font, placed);
      read++;
      words += placed.length;
      confidence += result.confidence;
      if (result.text) text.push(result.text);
    }
    onProgress?.('Saving the PDF', 1);
    const bytes = await out.save({ useObjectStreams: true });
    return { bytes, pages: total, read, skipped, words, confidence: read ? confidence / read : 0, text: text.join('\n\n') };
  } finally {
    await closePdfJs(js);
  }
}

function writeLayer(
  lib: typeof PdfLib,
  doc: PdfLib.PDFDocument,
  page: PdfLib.PDFPage,
  font: PdfLib.PDFFont,
  placed: ReturnType<typeof placeWords>,
): void {
  const { PDFOperator, PDFNumber, TextRenderingMode } = lib;
  const ops = lib;
  // Keep whatever state the page's own drawing leaves behind (an unclosed
  // transform, say) from moving the text layer: wrap it in q ... Q first.
  page.node.normalize();
  const start = doc.context.register(doc.context.contentStream([ops.pushGraphicsState()]));
  const end = doc.context.register(doc.context.contentStream([ops.popGraphicsState()]));
  page.node.wrapContentStreams(start, end);
  const key = page.node.newFontDictionary('OcrText', font.ref);
  const list: PdfLib.PDFOperator[] = [ops.pushGraphicsState(), ops.beginText(), ops.setTextRenderingMode(TextRenderingMode.Invisible)];
  for (const w of placed) {
    list.push(
      ops.setFontAndSize(key, w.size),
      PDFOperator.of('Tz' as never, [PDFNumber.of(w.scale)]),
      ops.setTextMatrix(...w.matrix),
      ops.showText(font.encodeText(w.text)),
    );
  }
  list.push(ops.endText(), ops.popGraphicsState());
  page.pushOperators(...list);
}
