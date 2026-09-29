import { createShell, processEach } from '../lib/shell';
import { canvasToBlob, makeCanvas } from '../lib/image';
import { closePdfJs, displayedSize, loadDocument, openWithPdfJs, renderPage, stampPdf, type Stamp } from '../lib/pdf';
import { suffixName, type OutputFile } from '../lib/files';
import { drawWatermark, type WatermarkOptions } from '../lib/watermark';
import { requireText, setPreview, watermarkOptions } from './watermark-common';

/** Layer resolution: 3 pixels per point is about 216 dpi, sharp in print. */
const PX_PER_PT = 3;
const MAX_LAYER = 4096;

async function layerPng(w: number, h: number, o: WatermarkOptions): Promise<Uint8Array> {
  const s = Math.min(PX_PER_PT, MAX_LAYER / Math.max(w, h));
  const c = makeCanvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  drawWatermark(c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, c.width, c.height, o);
  return new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer());
}

let previewToken = 0;

const shell = createShell({
  async onFilesChanged(files) {
    const token = ++previewToken;
    if (files.length === 0) return setPreview(undefined);
    try {
      const bytes = new Uint8Array(await files[0]!.file.arrayBuffer());
      const pdf = await openWithPdfJs(bytes);
      try {
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        const { canvas } = await renderPage(pdf, 1, 900 / Math.max(vp.width, vp.height));
        if (token !== previewToken) return;
        const n = pdf.numPages;
        setPreview(canvas, `Preview of page 1. The watermark goes on all ${n} page${n === 1 ? '' : 's'}${files.length > 1 ? ` of each of the ${files.length} PDFs` : ''}, sized to each page.`);
      } finally {
        await closePdfJs(pdf);
      }
    } catch (e) {
      setPreview(undefined);
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const o = watermarkOptions();
    requireText(o);
    return processEach(files, progress, 'Watermarking', async (entry, index) => {
      const source = new Uint8Array(await entry.file.arrayBuffer());
      const doc = await loadDocument(source);
      const layers = new Map<string, Uint8Array>();
      const stamps: Stamp[] = [];
      for (const [i, page] of doc.getPages().entries()) {
        const { w, h } = displayedSize(page);
        const key = `${Math.round(w)}x${Math.round(h)}`;
        let png = layers.get(key);
        if (!png) {
          png = await layerPng(w, h, o);
          layers.set(key, png);
        }
        stamps.push({ page: i, png, x: 0, y: 0, width: 1, height: 1 });
      }
      const out = await stampPdf(source, stamps, (done, all) =>
        progress.set(`Watermarking page ${done} of ${all}`, (index + done / all) / files.length),
      );
      const file: OutputFile = {
        name: suffixName(entry.file.name, '-watermarked', 'pdf'),
        blob: new Blob([out as BlobPart], { type: 'application/pdf' }),
        note: `${stamps.length} page${stamps.length === 1 ? '' : 's'} watermarked`,
      };
      return file;
    });
  },
  resultsTitle: () => 'Watermarked',
});
