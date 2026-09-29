/**
 * Grayscale PDFs without turning pages into pictures. A full-page rectangle
 * in neutral grey is drawn over each page with the Saturation blend mode: the
 * result keeps the brightness of everything underneath but takes the grey's
 * zero saturation, so every colour becomes its own shade of grey while text,
 * vector drawings and links stay exactly as they were.
 */
import { loadDocument, loadPdfLib, visibleBox } from './pdf';

export async function grayscalePdf(source: Uint8Array): Promise<{ bytes: Uint8Array; pages: number }> {
  const lib = await loadPdfLib();
  const { pushGraphicsState, popGraphicsState, setGraphicsState, setFillingRgbColor, rectangle, fill } = lib;
  const doc = await loadDocument(source);
  // pdf-lib's drawing options only allow the separable blend modes, so the
  // graphics state is written by hand: one shared /BM /Saturation state.
  const gs = doc.context.register(doc.context.obj({ Type: 'ExtGState', BM: 'Saturation' }));
  const pages = doc.getPages();
  for (const page of pages) {
    const box = visibleBox(page);
    const name = page.node.newExtGState('GS', gs);
    page.pushOperators(
      pushGraphicsState(),
      setGraphicsState(name),
      setFillingRgbColor(0.5, 0.5, 0.5),
      rectangle(box.x, box.y, box.width, box.height),
      fill(),
      popGraphicsState(),
    );
  }
  return { bytes: await doc.save({ useObjectStreams: true, updateFieldAppearances: false }), pages: pages.length };
}
