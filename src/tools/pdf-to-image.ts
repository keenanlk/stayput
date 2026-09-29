import { createShell, bindRange, num, radio, str } from '../lib/shell';
import { closePdfJs, openWithPdfJs, renderPage } from '../lib/pdf';
import { canvasToBlob } from '../lib/image';
import { parsePageRange } from '../lib/ranges';
import { baseName, type OutputFile } from '../lib/files';
import { tiffPage, writeTiff, type TiffPage } from '../lib/tiff-write';

bindRange('quality', 'quality-out');
let count = 0;
const info = document.getElementById('page-info')!;

const pagesInputs = document.querySelectorAll<HTMLInputElement>('input[name="pages"]');
const syncPages = () => {
  document.getElementById('range-field')!.hidden = radio('pages', 'all') !== 'range';
};
pagesInputs.forEach((i) => i.addEventListener('change', syncPages));
syncPages();
const formatSel = document.getElementById('format') as HTMLSelectElement;
const syncFormat = () => (document.getElementById('quality-field')!.hidden = formatSel.value !== 'image/jpeg');
formatSel.addEventListener('change', syncFormat);
syncFormat();

createShell({
  async onFilesChanged(files) {
    count = 0;
    info.textContent = '';
    const f = files[0];
    if (!f) return;
    const doc = await openWithPdfJs(new Uint8Array(await f.file.arrayBuffer()));
    count = doc.numPages;
    await closePdfJs(doc);
    info.textContent = `${count} page${count === 1 ? '' : 's'}`;
  },
  async process(files, progress) {
    const entry = files[0]!;
    const doc = await openWithPdfJs(new Uint8Array(await entry.file.arrayBuffer()));
    try {
      const type = str('format', 'image/png');
      const ext = type === 'image/png' ? 'png' : 'jpg';
      const tiff = type === 'image/tiff';
      const tiffPages: TiffPage[] = [];
      let tiffPreview = '';
      const quality = num('quality', 90) / 100;
      const dpi = num('dpi', 150);
      const pages = radio('pages', 'all') === 'all' ? Array.from({ length: doc.numPages }, (_, i) => i) : parsePageRange(str('range'), doc.numPages);
      const base = baseName(entry.file.name);
      const pad = String(doc.numPages).length;
      const outs: OutputFile[] = [];
      for (const [i, p] of pages.entries()) {
        progress.set(`Rendering page ${p + 1} (${i + 1} of ${pages.length})`, i / pages.length);
        const { canvas } = await renderPage(doc, p + 1, dpi / 72);
        if (tiff) {
          // Pages go into one multi-page TIFF, written once every page is rendered.
          tiffPages.push(tiffPage(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, dpi));
          if (!tiffPreview) {
            const s = 96 / Math.max(canvas.width, canvas.height);
            const preview = document.createElement('canvas');
            preview.width = Math.max(1, Math.round(canvas.width * s));
            preview.height = Math.max(1, Math.round(canvas.height * s));
            preview.getContext('2d')!.drawImage(canvas, 0, 0, preview.width, preview.height);
            tiffPreview = preview.toDataURL('image/png');
          }
          canvas.width = canvas.height = 0;
          continue;
        }
        const blob = await canvasToBlob(canvas, type, type === 'image/png' ? undefined : quality);
        const preview = document.createElement('canvas');
        const s = 96 / Math.max(canvas.width, canvas.height);
        preview.width = Math.max(1, Math.round(canvas.width * s));
        preview.height = Math.max(1, Math.round(canvas.height * s));
        preview.getContext('2d')!.drawImage(canvas, 0, 0, preview.width, preview.height);
        outs.push({ name: `${base}-page-${String(p + 1).padStart(pad, '0')}.${ext}`, blob, previewUrl: preview.toDataURL('image/png'), note: `${canvas.width}×${canvas.height}` });
        canvas.width = canvas.height = 0;
      }
      if (tiff) {
        progress.set('Writing the TIFF…', 0.98);
        const bytes = writeTiff(tiffPages);
        const first = tiffPages[0]!;
        outs.push({
          name: `${base}.tiff`,
          blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/tiff' }),
          previewUrl: tiffPreview,
          note: `${tiffPages.length} page${tiffPages.length === 1 ? '' : 's'}, ${first.width}×${first.height} at ${dpi} DPI`,
        });
      }
      progress.set('Done', 1);
      return outs;
    } finally {
      await closePdfJs(doc);
    }
  },
  resultsTitle: (o) => `${o.length} image${o.length === 1 ? '' : 's'} ready`,
});
