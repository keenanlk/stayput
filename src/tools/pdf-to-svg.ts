import { createShell, bool, radio, str } from '../lib/shell';
import { closePdfJs, loadPdfJs, openWithPdfJs } from '../lib/pdf';
import { parsePageRange } from '../lib/ranges';
import { baseName, formatBytes, type OutputFile } from '../lib/files';
import { isPhoneBrowser } from '../lib/phone-limit';
import { InputError } from '../lib/input-error';

const info = document.getElementById('page-info')!;
const pagesInputs = document.querySelectorAll<HTMLInputElement>('input[name="pages"]');
const syncPages = () => {
  document.getElementById('range-field')!.hidden = radio('pages', 'all') !== 'range';
};
pagesInputs.forEach((i) => i.addEventListener('change', syncPages));
syncPages();

/** A phone tab holds much less than a computer's: a run is kept to this many pages, and the pictures in it are scaled down. */
const PHONE_MAX_PAGES = 40;

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
    progress.set('Loading the converter', 0);
    // The converter (and its font reader) is only fetched when Run is pressed.
    const [{ pageToSvg, DESKTOP_OPTIONS, PHONE_OPTIONS }, { lib }] = await Promise.all([import('../lib/pdf-svg'), loadPdfJs()]);
    const phone = isPhoneBrowser();
    const doc = await openWithPdfJs(new Uint8Array(await entry.file.arrayBuffer()), { keepFontData: true });
    try {
      const pages = radio('pages', 'all') === 'all' ? Array.from({ length: doc.numPages }, (_, i) => i) : parsePageRange(str('range'), doc.numPages);
      if (phone && pages.length > PHONE_MAX_PAGES) {
        throw new InputError(`This PDF has ${pages.length} pages. A phone can run out of memory converting more than ${PHONE_MAX_PAGES} at once. Choose pages (for example 1-${PHONE_MAX_PAGES}) and run it again for the rest, or use a computer.`);
      }
      const opts = { ...(phone ? PHONE_OPTIONS : DESKTOP_OPTIONS), background: bool('background') };
      const layers = await doc.getOptionalContentConfig();
      const base = baseName(entry.file.name);
      const pad = String(doc.numPages).length;
      const outs: OutputFile[] = [];
      for (const [i, p] of pages.entries()) {
        progress.set(`Converting page ${p + 1} (${i + 1} of ${pages.length})`, i / pages.length);
        const page = await pageToSvg(lib, doc, p + 1, opts, layers);
        const blob = new Blob([page.svg], { type: 'image/svg+xml' });
        const name = doc.numPages === 1 ? `${base}.svg` : `${base}-page-${String(p + 1).padStart(pad, '0')}.svg`;
        outs.push({
          name,
          blob,
          previewUrl: URL.createObjectURL(blob),
          note: [`${formatBytes(blob.size)}`, ...page.notes].join('. '),
        });
      }
      progress.set('Done', 1);
      return outs;
    } finally {
      await closePdfJs(doc);
    }
  },
  resultsTitle: (o) => `${o.length} SVG${o.length === 1 ? '' : 's'} ready`,
});
