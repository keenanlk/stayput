/**
 * Flatten a PDF: form fields, comments, stamps, drawings and signatures that
 * sit on top of the page as annotations are drawn into the page itself and
 * the annotations removed, so every reader shows the same thing and nothing
 * can be edited. Each annotation's own appearance is placed exactly where a
 * reader would draw it (PDF 2.0, 12.5.5), so text stays text and selectable.
 *
 * The 'image' mode goes further and turns each page into a picture, for a
 * copy with no text layer at all.
 */
import type * as PdfLib from 'pdf-lib';
import { closePdfJs, loadDocument, loadPdfLib, openWithPdfJs, renderPage } from './pdf';
import { canvasToBlob } from './image';

export type FlattenMode = 'vector' | 'image';

export interface FlattenResult {
  bytes: Uint8Array;
  pages: number;
  /** Annotations drawn into the page (fields count once per box). */
  flattened: number;
  /** Form fields among them. */
  fields: number;
  /** Notes with no appearance of their own (sticky notes, say), left as they were. */
  kept: number;
}

type Matrix = [number, number, number, number, number, number];

const nums = (a: PdfLib.PDFArray | undefined, lib: typeof PdfLib): number[] | undefined =>
  a?.asArray().map((n) => (n instanceof lib.PDFNumber ? n.asNumber() : NaN));

/**
 * The matrix that maps an appearance's bounding box, after its own Matrix,
 * onto the annotation's rectangle.
 */
export function placeAppearance(bbox: number[], matrix: Matrix, rect: number[]): Matrix | undefined {
  const [a, b, c, d, e, f] = matrix;
  const corners = [
    [bbox[0]!, bbox[1]!],
    [bbox[2]!, bbox[1]!],
    [bbox[0]!, bbox[3]!],
    [bbox[2]!, bbox[3]!],
  ].map(([x, y]) => [a * x! + c * y! + e, b * x! + d * y! + f]);
  const xs = corners.map((p) => p[0]!);
  const ys = corners.map((p) => p[1]!);
  const bx0 = Math.min(...xs);
  const by0 = Math.min(...ys);
  const bw = Math.max(...xs) - bx0;
  const bh = Math.max(...ys) - by0;
  const rx0 = Math.min(rect[0]!, rect[2]!);
  const ry0 = Math.min(rect[1]!, rect[3]!);
  const rw = Math.abs(rect[2]! - rect[0]!);
  const rh = Math.abs(rect[3]! - rect[1]!);
  if (!(bw > 0 && bh > 0 && rw > 0 && rh > 0)) return undefined;
  const sx = rw / bw;
  const sy = rh / bh;
  return [sx, 0, 0, sy, rx0 - bx0 * sx, ry0 - by0 * sy];
}

const HIDDEN = 1 << 1;
const NO_VIEW = 1 << 5;

async function flattenVector(source: Uint8Array): Promise<FlattenResult> {
  const lib = await loadPdfLib();
  const { PDFName, PDFDict, PDFStream, PDFArray, PDFRef, PDFNumber } = lib;
  const doc = await loadDocument(source);
  const form = doc.getForm();
  // Fields filled in by a reader that did not draw them (NeedAppearances) get
  // an appearance first. The built-in font covers Western European letters
  // only; if an answer needs more, the reader's own drawing is kept instead.
  try {
    form.updateFieldAppearances(await doc.embedFont(lib.StandardFonts.Helvetica));
  } catch {
    /* keep existing appearances */
  }
  let flattened = 0;
  let fields = 0;
  let kept = 0;
  const pages = doc.getPages();
  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const keep: PdfLib.PDFObject[] = [];
    const draws: PdfLib.PDFOperator[] = [];
    for (const entry of annots.asArray()) {
      const dict = doc.context.lookupMaybe(entry, PDFDict);
      if (!dict) continue;
      const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText();
      // Links keep working; popups belong to the note they open.
      if (subtype === 'Link' || subtype === 'Popup') {
        keep.push(entry);
        continue;
      }
      const flags = dict.lookupMaybe(PDFName.of('F'), PDFNumber)?.asNumber() ?? 0;
      const ap = dict.lookupMaybe(PDFName.of('AP'), PDFDict);
      let normal: PdfLib.PDFObject | undefined = ap?.get(PDFName.of('N'));
      const resolved = normal instanceof PDFRef ? doc.context.lookup(normal) : normal;
      // Check boxes and radio buttons hold one appearance per state; /AS names the one showing.
      if (resolved instanceof PDFDict) {
        const state = dict.lookupMaybe(PDFName.of('AS'), PDFName);
        normal = state ? resolved.get(state) : undefined;
      }
      const stream = normal instanceof PDFRef ? doc.context.lookupMaybe(normal, PDFStream) : normal instanceof PDFStream ? normal : undefined;
      const isWidget = subtype === 'Widget';
      if (flags & (HIDDEN | NO_VIEW)) continue;
      if (!stream) {
        // A field with nothing to show is simply removed; a note without a drawing stays a note.
        if (!isWidget) {
          keep.push(entry);
          kept++;
        }
        continue;
      }
      const bbox = nums(stream.dict.lookupMaybe(PDFName.of('BBox'), PDFArray), lib);
      const matrix = (nums(stream.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray), lib) ?? [1, 0, 0, 1, 0, 0]) as Matrix;
      const rect = nums(dict.lookupMaybe(PDFName.of('Rect'), PDFArray), lib);
      const place = bbox && rect && bbox.length === 4 && rect.length === 4 ? placeAppearance(bbox, matrix, rect) : undefined;
      if (!place || place.some((n) => !Number.isFinite(n))) continue;
      stream.dict.set(PDFName.of('Type'), PDFName.of('XObject'));
      stream.dict.set(PDFName.of('Subtype'), PDFName.of('Form'));
      const ref = normal instanceof PDFRef ? normal : doc.context.register(stream);
      const name = page.node.newXObject('Flat', ref);
      draws.push(lib.pushGraphicsState(), lib.concatTransformationMatrix(...place), lib.drawObject(name), lib.popGraphicsState());
      flattened++;
      if (isWidget) fields++;
    }
    if (draws.length) {
      // Wrap the existing content in q…Q so a page that leaves its drawing state changed cannot shift the stamps.
      page.node.normalize();
      page.pushOperators(...draws);
    }
    if (keep.length) page.node.set(PDFName.of('Annots'), doc.context.obj(keep));
    else page.node.delete(PDFName.of('Annots'));
  }
  // Every field is now part of the page or gone, so the form itself goes.
  doc.catalog.delete(PDFName.of('AcroForm'));
  const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  return { bytes, pages: pages.length, flattened, fields, kept };
}

async function flattenToImages(source: Uint8Array, dpi: number, onPage?: (done: number, total: number) => void): Promise<FlattenResult> {
  const lib = await loadPdfLib();
  const pdf = await openWithPdfJs(source);
  try {
    const out = await lib.PDFDocument.create();
    for (let n = 1; n <= pdf.numPages; n++) {
      const { canvas, widthPt, heightPt } = await renderPage(pdf, n, dpi / 72);
      const jpg = await canvasToBlob(canvas, 'image/jpeg', 0.9);
      const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      out.addPage([widthPt, heightPt]).drawImage(img, { x: 0, y: 0, width: widthPt, height: heightPt });
      canvas.width = canvas.height = 0;
      onPage?.(n, pdf.numPages);
    }
    const bytes = await out.save({ useObjectStreams: true });
    return { bytes, pages: pdf.numPages, flattened: 0, fields: 0, kept: 0 };
  } finally {
    await closePdfJs(pdf);
  }
}

export function flattenPdf(source: Uint8Array, mode: FlattenMode, onPage?: (done: number, total: number) => void): Promise<FlattenResult> {
  return mode === 'image' ? flattenToImages(source, 150, onPage) : flattenVector(source);
}
