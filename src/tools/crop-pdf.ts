import { createShell, radio } from '../lib/shell';
import { closePdfJs, displayedSize, loadDocument, openWithPdfJs, renderPage } from '../lib/pdf';
import { contentBounds, cropPdf, type CropRect } from '../lib/crop-pdf';
import type * as PdfJs from 'pdfjs-dist';
import { suffixName, type OutputFile } from '../lib/files';

const panel = document.getElementById('crop-panel')!;
const stage = document.getElementById('stage')!;
const pageCanvas = document.getElementById('page-canvas') as HTMLCanvasElement;
const layer = document.getElementById('crop-layer')!;
const pageLabel = document.getElementById('page-label')!;
const cropCount = document.getElementById('crop-count')!;
const cropResult = document.getElementById('crop-result')!;

let pdf: PdfJs.PDFDocumentProxy | undefined;
let pageCount = 0;
let current = 0;
let pageSizes: { w: number; h: number }[] = [];
const rects = new Map<number, CropRect>();

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function showPage(index: number) {
  if (!pdf) return;
  current = clamp(index, 0, pageCount - 1);
  const size = pageSizes[current]!;
  const scale = Math.min(stage.parentElement!.clientWidth || 720, 900) / size.w;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { canvas } = await renderPage(pdf, current + 1, scale * dpr);
  pageCanvas.width = canvas.width;
  pageCanvas.height = canvas.height;
  pageCanvas.style.width = `${Math.round(size.w * scale)}px`;
  pageCanvas.style.height = `${Math.round(size.h * scale)}px`;
  pageCanvas.getContext('2d')!.drawImage(canvas, 0, 0);
  canvas.width = canvas.height = 0;
  pageLabel.textContent = `Page ${current + 1} of ${pageCount}`;
  (document.getElementById('prev-page') as HTMLButtonElement).disabled = current === 0;
  (document.getElementById('next-page') as HTMLButtonElement).disabled = current === pageCount - 1;
  paint();
}
document.getElementById('prev-page')!.addEventListener('click', () => void showPage(current - 1));
document.getElementById('next-page')!.addEventListener('click', () => void showPage(current + 1));
document.getElementById('crop-reset')!.addEventListener('click', () => {
  rects.clear();
  cropResult.textContent = '';
  paint();
});

let resizeTimer: number | undefined;
window.addEventListener('resize', () => {
  if (!pdf) return;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => void showPage(current), 150);
});

function place(el: HTMLElement, r: CropRect) {
  el.style.left = `${r.x * 100}%`;
  el.style.top = `${r.y * 100}%`;
  el.style.width = `${r.width * 100}%`;
  el.style.height = `${r.height * 100}%`;
}

let box: HTMLElement | undefined;
function paint(preview?: CropRect) {
  const r = preview ?? rects.get(current);
  if (r) {
    if (!box) {
      box = document.createElement('div');
      box.className = 'crop-box';
      layer.append(box);
    }
    place(box, r);
  } else {
    box?.remove();
    box = undefined;
  }
  if (preview) return;
  const r0 = rects.get(current);
  const size = pageSizes[current];
  const mm = (pt: number) => Math.round((pt / 72) * 25.4);
  cropCount.textContent = rects.size
    ? `${plural(rects.size, 'page')} cropped${r0 && size ? `; this one to ${mm(r0.width * size.w)} × ${mm(r0.height * size.h)} mm` : ''}`
    : '';
  shell.hideError();
  shell.setHint(rects.size ? '' : 'Next: press Trim white margins, or drag on the page to draw the area to keep.');
}

/* Drawing the crop box. */
let start: { x: number; y: number } | undefined;
function point(e: PointerEvent) {
  const r = layer.getBoundingClientRect();
  return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
}
const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): CropRect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
layer.addEventListener('pointerdown', (e) => {
  if (!pdf || e.button > 0) return;
  e.preventDefault();
  layer.setPointerCapture(e.pointerId);
  start = point(e);
});
layer.addEventListener('pointermove', (e) => {
  if (start) paint(rectFrom(start, point(e)));
});
layer.addEventListener('pointerup', (e) => {
  if (!start) return;
  const r = rectFrom(start, point(e));
  start = undefined;
  if (r.width * layer.clientWidth < 12 || r.height * layer.clientHeight < 12) {
    paint();
    return;
  }
  if (radio('crop-scope', 'all') === 'all') for (let i = 0; i < pageCount; i++) rects.set(i, r);
  else rects.set(current, r);
  cropResult.textContent = '';
  paint();
});
layer.addEventListener('pointercancel', () => {
  start = undefined;
  paint();
});

document.getElementById('auto-trim')!.addEventListener('click', async () => {
  if (!pdf) return;
  let trimmed = 0;
  for (let i = 0; i < pageCount; i++) {
    cropResult.textContent = `Finding the margins of page ${i + 1} of ${pageCount}…`;
    const r = await contentBounds(pdf, i);
    if (r && (r.width < 0.98 || r.height < 0.98)) {
      rects.set(i, r);
      trimmed++;
    }
  }
  cropResult.textContent = trimmed
    ? `Trimmed the white margins on ${plural(trimmed, 'page')}. Check each page; drag to adjust any of them.`
    : 'These pages have no white margins to trim. Drag on the page to choose the area to keep.';
  paint();
});

async function reset() {
  rects.clear();
  box?.remove();
  box = undefined;
  cropCount.textContent = '';
  cropResult.textContent = '';
  shell.setHint();
  if (pdf) {
    const old = pdf;
    pdf = undefined;
    await closePdfJs(old);
  }
  pageCount = 0;
  pageSizes = [];
  current = 0;
  panel.hidden = true;
}

const shell = createShell({
  autoDownloadSingle: true,
  async onFilesChanged(files) {
    await reset();
    const f = files[0];
    if (!f) return;
    const bytes = new Uint8Array(await f.file.arrayBuffer());
    const doc = await loadDocument(bytes);
    pageSizes = doc.getPages().map((p) => displayedSize(p));
    pdf = await openWithPdfJs(bytes);
    pageCount = pdf.numPages;
    panel.hidden = false;
    await showPage(0);
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (rects.size === 0) throw new Error('Choose what to keep first: press Trim white margins, or drag a box on the page.');
    progress.set('Cropping', 0.3);
    const bytes = await cropPdf(new Uint8Array(await entry.file.arrayBuffer()), rects);
    progress.set('Done', 1);
    const out: OutputFile = {
      name: suffixName(entry.file.name, '-cropped', 'pdf'),
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      note: `${plural(rects.size, 'page')} cropped`,
    };
    return [out];
  },
  resultsTitle: () => 'Cropped',
});
