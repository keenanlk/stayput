import { createShell, bindRange, num, radio, str } from '../lib/shell';
import { closePdfJs, openWithPdfJs, renderPage } from '../lib/pdf';
import { canvasToBlob } from '../lib/image';
import { parsePageRange } from '../lib/ranges';
import { baseName, type OutputFile } from '../lib/files';

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
const syncFormat = () => (document.getElementById('quality-field')!.hidden = formatSel.value === 'image/png');
formatSel.addEventListener('change', syncFormat);
syncFormat();

createShell({
  async onFilesChanged(files) {
    count = 0;
    info.textContent = '';
    const f = files[0];
    if (!f) return;
    try {
      const doc = await openWithPdfJs(new Uint8Array(await f.file.arrayBuffer()));
      count = doc.numPages;
      await closePdfJs(doc);
      info.textContent = `${count} page${count === 1 ? '' : 's'}`;
    } catch (e) {
      info.textContent = e instanceof Error ? e.message : String(e);
    }
  },
  async process(files, progress) {
    const entry = files[0]!;
    const doc = await openWithPdfJs(new Uint8Array(await entry.file.arrayBuffer()));
    try {
      const type = str('format', 'image/png');
      const ext = type === 'image/png' ? 'png' : 'jpg';
      const quality = num('quality', 90) / 100;
      const dpi = num('dpi', 150);
      const pages = radio('pages', 'all') === 'all' ? Array.from({ length: doc.numPages }, (_, i) => i) : parsePageRange(str('range'), doc.numPages);
      const base = baseName(entry.file.name);
      const pad = String(doc.numPages).length;
      const outs: OutputFile[] = [];
      for (const [i, p] of pages.entries()) {
        progress.set(`Rendering page ${p + 1} (${i + 1} of ${pages.length})`, i / pages.length);
        const { canvas } = await renderPage(doc, p + 1, dpi / 72);
        const blob = await canvasToBlob(canvas, type, type === 'image/png' ? undefined : quality);
        const preview = document.createElement('canvas');
        const s = 96 / Math.max(canvas.width, canvas.height);
        preview.width = Math.max(1, Math.round(canvas.width * s));
        preview.height = Math.max(1, Math.round(canvas.height * s));
        preview.getContext('2d')!.drawImage(canvas, 0, 0, preview.width, preview.height);
        outs.push({ name: `${base}-page-${String(p + 1).padStart(pad, '0')}.${ext}`, blob, previewUrl: preview.toDataURL('image/png'), note: `${canvas.width}×${canvas.height}` });
        canvas.width = canvas.height = 0;
      }
      progress.set('Done', 1);
      return outs;
    } finally {
      await closePdfJs(doc);
    }
  },
  resultsTitle: (o) => `${o.length} image${o.length === 1 ? '' : 's'} ready`,
});
