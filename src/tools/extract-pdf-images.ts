import { createShell, bool, radio, str } from '../lib/shell';
import { closePdfJs, openWithPdfJs } from '../lib/pdf';
import { extractImages } from '../lib/pdf-images';
import { canvasToBlob } from '../lib/image';
import { parsePageRange } from '../lib/ranges';
import { baseName, type OutputFile } from '../lib/files';

const info = document.getElementById('page-info')!;
const pagesInputs = document.querySelectorAll<HTMLInputElement>('input[name="pages"]');
const syncPages = () => {
  document.getElementById('range-field')!.hidden = radio('pages', 'all') !== 'range';
};
pagesInputs.forEach((i) => i.addEventListener('change', syncPages));
syncPages();

createShell({
  async onFilesChanged(files) {
    info.textContent = '';
    const f = files[0];
    if (!f) return;
    const doc = await openWithPdfJs(new Uint8Array(await f.file.arrayBuffer()));
    const count = doc.numPages;
    await closePdfJs(doc);
    info.textContent = `${count} page${count === 1 ? '' : 's'}`;
  },
  async process(files, progress) {
    const entry = files[0]!;
    const doc = await openWithPdfJs(new Uint8Array(await entry.file.arrayBuffer()));
    try {
      const type = str('format', 'image/png');
      const ext = type === 'image/png' ? 'png' : 'jpg';
      const pages = radio('pages', 'all') === 'all' ? Array.from({ length: doc.numPages }, (_, i) => i) : parsePageRange(str('range'), doc.numPages);
      const { images, skippedSmall, skippedRepeats } = await extractImages(doc, pages, {
        minSide: bool('skip-small') ? 50 : 1,
        dedupe: bool('dedupe'),
        onPage: (i, n) => progress.set(`Looking for pictures on page ${pages[i]! + 1} (${i + 1} of ${n})`, (i / n) * 0.8),
      });
      if (!images.length) {
        const left = skippedSmall + skippedRepeats;
        throw new Error(
          left
            ? `Only ${left} small or repeated image${left === 1 ? ' was' : 's were'} found. Untick the options to include ${left === 1 ? 'it' : 'them'}.`
            : 'No pictures are stored in these pages. If the PDF is a scan or the pictures are drawings, use PDF to Image to save whole pages instead.',
        );
      }
      const base = baseName(entry.file.name);
      const pad = String(images.length).length;
      const outs: OutputFile[] = [];
      for (const [i, img] of images.entries()) {
        progress.set(`Saving image ${i + 1} of ${images.length}`, 0.8 + (i / images.length) * 0.2);
        const { canvas } = img;
        let src = canvas;
        if (type === 'image/jpeg') {
          // JPG has no transparency: put see-through areas on white, as a viewer shows them.
          src = document.createElement('canvas');
          src.width = canvas.width;
          src.height = canvas.height;
          const ctx = src.getContext('2d')!;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, src.width, src.height);
          ctx.drawImage(canvas, 0, 0);
        }
        const blob = await canvasToBlob(src, type, type === 'image/jpeg' ? 0.92 : undefined);
        const preview = document.createElement('canvas');
        const s = Math.min(1, 96 / Math.max(canvas.width, canvas.height));
        preview.width = Math.max(1, Math.round(canvas.width * s));
        preview.height = Math.max(1, Math.round(canvas.height * s));
        preview.getContext('2d')!.drawImage(canvas, 0, 0, preview.width, preview.height);
        outs.push({
          name: `${base}-image-${String(i + 1).padStart(pad, '0')}.${ext}`,
          blob,
          previewUrl: preview.toDataURL('image/png'),
          note: `${canvas.width}×${canvas.height}, page ${img.page}`,
        });
        canvas.width = canvas.height = src.width = src.height = 0;
      }
      progress.set('Done', 1);
      return outs;
    } finally {
      await closePdfJs(doc);
    }
  },
  resultsTitle: (o) => `${o.length} image${o.length === 1 ? '' : 's'} found`,
});
