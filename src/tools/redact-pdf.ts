import { createShell } from '../lib/shell';
import { closePdfJs, displayedSize, loadDocument, openWithPdfJs, renderPage } from '../lib/pdf';
import { findOnPage, matcher, redactPdf, type Pattern, type RedactBox } from '../lib/redact';
import type * as PdfJs from 'pdfjs-dist';
import { suffixName, type OutputFile } from '../lib/files';

const panel = document.getElementById('redact-panel')!;
const stage = document.getElementById('stage')!;
const pageCanvas = document.getElementById('page-canvas') as HTMLCanvasElement;
const layer = document.getElementById('redact-layer')!;
const pageLabel = document.getElementById('page-label')!;
const boxCount = document.getElementById('box-count')!;
const findText = document.getElementById('find-text') as HTMLInputElement;
const findResult = document.getElementById('find-result')!;

let pdf: PdfJs.PDFDocumentProxy | undefined;
/** Settles when the file being opened is ready (or has failed to open). */
let opening: Promise<unknown> = Promise.resolve();
let pageCount = 0;
let current = 0;
let pageSizes: { w: number; h: number }[] = [];
let boxes: RedactBox[] = [];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : /(x|ch)$/.test(word) ? 'es' : 's'}`;

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
document.getElementById('clear-page')!.addEventListener('click', () => {
  boxes = boxes.filter((b) => b.page !== current);
  paint();
});

let resizeTimer: number | undefined;
window.addEventListener('resize', () => {
  if (!pdf) return;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => void showPage(current), 150);
});

function place(el: HTMLElement, b: { x: number; y: number; width: number; height: number }) {
  el.style.left = `${b.x * 100}%`;
  el.style.top = `${b.y * 100}%`;
  el.style.width = `${b.width * 100}%`;
  el.style.height = `${b.height * 100}%`;
}

function paint() {
  layer.querySelectorAll('.redact-box').forEach((el) => el.remove());
  for (const b of boxes.filter((x) => x.page === current)) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'redact-box';
    el.setAttribute('aria-label', 'Redaction box. Press to remove it.');
    place(el, b);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', () => {
      boxes = boxes.filter((x) => x !== b);
      paint();
    });
    layer.append(el);
  }
  const pages = new Set(boxes.map((b) => b.page)).size;
  boxCount.textContent = boxes.length ? `${plural(boxes.length, 'box')} on ${plural(pages, 'page')}` : '';
  shell.hideError();
  shell.setHint(boxes.length ? '' : 'Next: search for text to redact, or drag on the page to black out an area.');
}

/* Drawing boxes by hand. */
let start: { x: number; y: number } | undefined;
let ghost: HTMLElement | undefined;
function point(e: PointerEvent) {
  const r = layer.getBoundingClientRect();
  return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
}
function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
layer.addEventListener('pointerdown', (e) => {
  if (!pdf || e.button > 0) return;
  e.preventDefault();
  layer.setPointerCapture(e.pointerId);
  start = point(e);
  ghost = document.createElement('div');
  ghost.className = 'redact-box is-drawing';
  place(ghost, { ...start, width: 0, height: 0 });
  layer.append(ghost);
});
layer.addEventListener('pointermove', (e) => {
  if (start && ghost) place(ghost, rectFrom(start, point(e)));
});
const finish = (e: PointerEvent) => {
  if (!start) return;
  const r = rectFrom(start, point(e));
  start = undefined;
  ghost?.remove();
  ghost = undefined;
  // Ignore taps and slips: a box must be at least a few pixels each way.
  if (r.width * layer.clientWidth < 6 || r.height * layer.clientHeight < 6) return;
  boxes.push({ page: current, ...r });
  paint();
};
layer.addEventListener('pointerup', finish);
layer.addEventListener('pointercancel', () => {
  start = undefined;
  ghost?.remove();
});

/* Finding text. */
async function find(query: string | Pattern, label: string) {
  // A search sent while the file is still opening (slow on a phone) waits for it rather than doing nothing.
  await opening;
  if (!pdf) return;
  const re = matcher(query);
  let found = 0;
  const pagesHit = new Set<number>();
  findResult.textContent = 'Searching…';
  for (let i = 0; i < pageCount; i++) {
    const hits = await findOnPage(pdf, i, re);
    // Skip boxes already marked (searching twice should not double them).
    for (const h of hits) {
      if (boxes.some((b) => b.page === h.page && Math.abs(b.x - h.x) < 1e-4 && Math.abs(b.y - h.y) < 1e-4)) continue;
      boxes.push(h);
      found++;
      pagesHit.add(i);
    }
  }
  findResult.textContent = found
    ? `Marked ${plural(found, 'match')} for ${label} on ${plural(pagesHit.size, 'page')}. Check each page: text inside images or scans cannot be searched, so draw boxes over those by hand.`
    : `No text matching ${label} was found. If the PDF is a scan, the words are pictures: draw boxes over them by hand.`;
  const firstHit = [...pagesHit].sort((a, b) => a - b)[0];
  if (firstHit !== undefined && !pagesHit.has(current)) await showPage(firstHit);
  else paint();
}
document.getElementById('find-form')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = findText.value.trim();
  if (q) void find(q, `“${q}”`);
});
const patternLabels: Record<Pattern, string> = { email: 'email addresses', phone: 'phone numbers', number: 'long numbers' };
document.querySelectorAll<HTMLButtonElement>('[data-pattern]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const p = btn.dataset.pattern as Pattern;
    void find(p, patternLabels[p]);
  }),
);

async function reset() {
  boxes = [];
  layer.querySelectorAll('.redact-box').forEach((el) => el.remove());
  boxCount.textContent = '';
  findResult.textContent = '';
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
    const open = (async () => {
      const bytes = new Uint8Array(await f.file.arrayBuffer());
      const doc = await loadDocument(bytes);
      pageSizes = doc.getPages().map((p) => displayedSize(p));
      pdf = await openWithPdfJs(bytes);
      pageCount = pdf.numPages;
      panel.hidden = false;
      await showPage(0);
    })();
    opening = open.catch(() => {});
    await open;
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (!pdf) throw new Error('Drop a PDF first.');
    if (boxes.length === 0) throw new Error('Mark something to redact first: search for text, or drag a box over the page.');
    const pages = new Set(boxes.map((b) => b.page)).size;
    progress.set('Redacting', 0.05);
    const bytes = await redactPdf(new Uint8Array(await entry.file.arrayBuffer()), pdf, boxes, (done, total) =>
      progress.set(`Redacting page ${done} of ${total}`, 0.05 + (0.85 * done) / total),
    );
    progress.set('Done', 1);
    const out: OutputFile = {
      name: suffixName(entry.file.name, '-redacted', 'pdf'),
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      note: `${plural(boxes.length, 'area')} removed on ${plural(pages, 'page')}; those pages are now images, the rest are unchanged`,
    };
    return [out];
  },
  resultsTitle: () => 'Redacted',
});
