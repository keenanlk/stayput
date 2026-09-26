import { createShell, bindRange, num, str } from '../lib/shell';
import { addPageNumbers, closePdfJs, loadDocument, openWithPdfJs, pageThumbnail, type NumberFont, type NumberPosition } from '../lib/pdf';
import { suffixName, type OutputFile } from '../lib/files';

bindRange('font-size', 'font-size-out');
bindRange('margin', 'margin-out');

const panel = document.getElementById('preview-panel')!;
const previewImg = document.getElementById('preview-img') as HTMLImageElement;
const sample = document.getElementById('number-sample')!;
const info = document.getElementById('page-info')!;
const formatSel = document.getElementById('format') as HTMLSelectElement;
const customField = document.getElementById('custom-field')!;
const firstPageInput = document.getElementById('first-page') as HTMLInputElement;

let total = 0;
let thumbs = new Map<number, string>();
let bytes: Uint8Array | undefined;

function template(): string {
  const v = formatSel.value;
  return v === 'custom' ? str('custom', '{n}') || '{n}' : v;
}

function options() {
  const firstPage = Math.max(1, Math.min(total || 1, Math.round(num('first-page', 1)))) - 1;
  return {
    position: str('position', 'bottom-center') as NumberPosition,
    template: template(),
    start: Math.max(0, Math.round(num('start', 1))),
    firstPage,
    fontSize: num('font-size', 11),
    margin: num('margin', 36),
    font: str('font', 'helvetica') as NumberFont,
    color: str('color', '#333333'),
  };
}

/** Mirror the options onto the thumbnail so people see where the number lands. */
async function paintPreview() {
  if (!total) return;
  const o = options();
  const pageIndex = o.firstPage;
  const numbered = total - pageIndex;
  const text = o.template.replace(/\{n\}/g, String(o.start)).replace(/\{total\}/g, String(o.start + numbered - 1)).replace(/\{count\}/g, String(numbered));
  sample.textContent = text;
  sample.style.color = o.color;
  sample.style.fontFamily = o.font === 'times' ? 'Georgia, "Times New Roman", serif' : o.font === 'courier' ? 'ui-monospace, Menlo, Consolas, monospace' : 'Helvetica, Arial, sans-serif';
  sample.className = `number-sample pos-${o.position}`;
  // Scale the type and margin to the thumbnail: a Letter page is 612 pt wide and the thumb is about 220 px.
  const scale = 220 / 612;
  sample.style.fontSize = `${Math.max(6, o.fontSize * scale * 1.6)}px`;
  sample.style.setProperty('--m', `${o.margin * scale}px`);
  info.textContent = `${total} page${total === 1 ? '' : 's'}; numbering ${numbered} of them, starting on page ${pageIndex + 1}`;
  const thumb = thumbs.get(pageIndex) ?? (await loadThumb(pageIndex));
  if (thumb) previewImg.src = thumb;
}

async function loadThumb(index: number): Promise<string | undefined> {
  if (!bytes) return undefined;
  const pdf = await openWithPdfJs(bytes);
  try {
    const url = await pageThumbnail(pdf, index + 1, 220);
    thumbs.set(index, url);
    return url;
  } finally {
    await closePdfJs(pdf);
  }
}

formatSel.addEventListener('change', () => {
  customField.hidden = formatSel.value !== 'custom';
});
document.getElementById('options')!.addEventListener('input', () => void paintPreview());
document.getElementById('options')!.addEventListener('change', () => void paintPreview());

createShell({
  async onFilesChanged(files) {
    total = 0;
    bytes = undefined;
    thumbs = new Map();
    panel.hidden = true;
    const f = files[0];
    if (!f) return;
    bytes = new Uint8Array(await f.file.arrayBuffer());
    const doc = await loadDocument(bytes);
    total = doc.getPageCount();
    firstPageInput.max = String(total);
    if (num('first-page', 1) > total) firstPageInput.value = '1';
    panel.hidden = false;
    await paintPreview();
  },
  async process(files, progress) {
    const entry = files[0]!;
    const source = bytes ?? new Uint8Array(await entry.file.arrayBuffer());
    if (total === 0) await loadDocument(source);
    const o = options();
    if (o.firstPage >= total) throw new Error(`First page to number must be between 1 and ${total}.`);
    progress.set('Numbering pages', 0.1);
    const { bytes: out, numbered } = await addPageNumbers(source, o, (done, all) => progress.set(`Numbering page ${done} of ${all}`, 0.1 + (0.8 * done) / all));
    progress.set('Done', 1);
    const file: OutputFile = {
      name: suffixName(entry.file.name, '-numbered', 'pdf'),
      blob: new Blob([out as BlobPart], { type: 'application/pdf' }),
      originalSize: entry.file.size,
      note: `${numbered} page${numbered === 1 ? '' : 's'} numbered`,
    };
    return [file];
  },
  resultsTitle: () => 'Numbered',
});
