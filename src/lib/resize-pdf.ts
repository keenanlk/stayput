/**
 * Change the paper size of a PDF (A4 to US Letter, say). Each page gets the
 * new size and its content is scaled to fit inside the margin, centred, with
 * a clip so nothing outside the old page edge shows. The content itself is
 * not redrawn, so text stays text; links, form fields and comments are moved
 * and scaled with it.
 */
import type * as PdfLib from 'pdf-lib';
import { loadDocument, loadPdfLib, visibleBox } from './pdf';

export { PAPER, planPage, type PaperSize, type Orientation, type ResizeOptions, type PagePlan } from './paper';
import { planPage, type ResizeOptions } from './paper';

export interface ResizeResult {
  bytes: Uint8Array;
  pages: number;
  /** Smallest and largest scale used, for the note. */
  minScale: number;
  maxScale: number;
}

export async function resizePdf(source: Uint8Array, opts: ResizeOptions): Promise<ResizeResult> {
  const lib = await loadPdfLib();
  const { PDFName, PDFArray, PDFDict, PDFNumber, PDFContentStream, PDFOperator, PDFOperatorNames: Op } = lib;
  const doc = await loadDocument(source);
  const ctx = doc.context;
  const pages = doc.getPages();
  let minScale = Infinity;
  let maxScale = 0;
  const stream = (ops: PdfLib.PDFOperator[]) => ctx.register(PDFContentStream.of(ctx.obj({}), ops));
  for (const page of pages) {
    const box = visibleBox(page);
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const plan = planPage(box, rotation, opts);
    minScale = Math.min(minScale, plan.scale);
    maxScale = Math.max(maxScale, plan.scale);
    const { scale: k, dx, dy } = plan;
    const n = (v: number) => lib.PDFNumber.of(Number(v.toFixed(4)));
    // q, move and scale, clip to the old visible box ... Q
    const start = stream([
      PDFOperator.of(Op.PushGraphicsState),
      PDFOperator.of(Op.ConcatTransformationMatrix, [n(k), n(0), n(0), n(k), n(dx), n(dy)]),
      PDFOperator.of(Op.AppendRectangle, [n(box.x), n(box.y), n(box.width), n(box.height)]),
      PDFOperator.of(Op.ClipNonZero),
      PDFOperator.of(Op.EndPath),
    ]);
    const end = stream([PDFOperator.of(Op.PopGraphicsState)]);
    // A single content stream becomes an array so it can be wrapped.
    const contents = page.node.get(PDFName.of('Contents'));
    if (contents && !(ctx.lookup(contents) instanceof PDFArray)) page.node.set(PDFName.of('Contents'), ctx.obj([contents]));
    if (!page.node.get(PDFName.of('Contents'))) page.node.set(PDFName.of('Contents'), ctx.obj([]));
    page.node.wrapContentStreams(start, end);
    page.setMediaBox(0, 0, plan.width, plan.height);
    for (const key of ['CropBox', 'BleedBox', 'TrimBox', 'ArtBox']) page.node.delete(PDFName.of(key));
    // Links, fields and comments move with the content.
    const move = (arr: PdfLib.PDFArray | undefined) => {
      if (!arr) return;
      for (let i = 0; i < arr.size(); i++) {
        const v = arr.lookupMaybe(i, PDFNumber)?.asNumber();
        if (v !== undefined) arr.set(i, n(i % 2 === 0 ? v * k + dx : v * k + dy));
      }
    };
    for (const entry of page.node.Annots()?.asArray() ?? []) {
      const annot = ctx.lookupMaybe(entry, PDFDict);
      if (!annot) continue;
      move(annot.lookupMaybe(PDFName.of('Rect'), PDFArray));
      move(annot.lookupMaybe(PDFName.of('QuadPoints'), PDFArray));
    }
  }
  const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  return { bytes, pages: pages.length, minScale, maxScale };
}
