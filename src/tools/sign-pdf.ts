import { createShell, radio, str } from '../lib/shell';
import { closePdfJs, displayedSize, loadDocument, openWithPdfJs, renderPage, stampPdf, type Stamp } from '../lib/pdf';
import type * as PdfJs from 'pdfjs-dist';
import { suffixName, type OutputFile } from '../lib/files';

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */
const panel = document.getElementById('sign-panel')!;
const pad = document.getElementById('sig-pad') as HTMLCanvasElement;
const padCtx = pad.getContext('2d')!;
const drawBox = document.getElementById('draw-box')!;
const typeBox = document.getElementById('type-box')!;
const sigText = document.getElementById('sig-text') as HTMLInputElement;
const sigFont = document.getElementById('sig-font') as HTMLSelectElement;
const sigColor = document.getElementById('sig-color') as HTMLSelectElement;
const sigPreview = document.getElementById('sig-preview')!;
const stage = document.getElementById('stage')!;
const pageCanvas = document.getElementById('page-canvas') as HTMLCanvasElement;
const layer = document.getElementById('stamp-layer')!;
const pageLabel = document.getElementById('page-label')!;
const placementCount = document.getElementById('placement-count')!;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
interface Placement {
  id: number;
  page: number;
  /** Fractions of the displayed page, origin top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Transparent PNG of the stamp. */
  png: Uint8Array;
  url: string;
  /** Intrinsic aspect ratio (width / height) of the PNG. */
  aspect: number;
  kind: 'signature' | 'initials' | 'date' | 'text';
}

let pdf: PdfJs.PDFDocumentProxy | undefined;
let pageCount = 0;
let current = 0;
/** Displayed page sizes in points, per page. */
let pageSizes: { w: number; h: number }[] = [];
let placements: Placement[] = [];
let nextId = 1;
let drawn = false;

/* ------------------------------------------------------------------ */
/* Signature pad                                                       */
/* ------------------------------------------------------------------ */
function resetPad() {
  padCtx.clearRect(0, 0, pad.width, pad.height);
  drawn = false;
}
let drawing = false;
let last: { x: number; y: number } | undefined;
function padPoint(e: PointerEvent) {
  const r = pad.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * pad.width, y: ((e.clientY - r.top) / r.height) * pad.height };
}
pad.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pad.setPointerCapture(e.pointerId);
  drawing = true;
  last = padPoint(e);
  padCtx.lineCap = 'round';
  padCtx.lineJoin = 'round';
  padCtx.strokeStyle = sigColor.value;
  padCtx.lineWidth = e.pointerType === 'pen' ? 3 + e.pressure * 4 : 4.5;
  // A dot for taps.
  padCtx.beginPath();
  padCtx.arc(last.x, last.y, padCtx.lineWidth / 2, 0, Math.PI * 2);
  padCtx.fillStyle = sigColor.value;
  padCtx.fill();
  drawn = true;
});
pad.addEventListener('pointermove', (e) => {
  if (!drawing || !last) return;
  const p = padPoint(e);
  if (e.pointerType === 'pen') padCtx.lineWidth = 3 + e.pressure * 4;
  padCtx.beginPath();
  padCtx.moveTo(last.x, last.y);
  padCtx.lineTo(p.x, p.y);
  padCtx.stroke();
  last = p;
});
const stop = () => {
  drawing = false;
  last = undefined;
};
pad.addEventListener('pointerup', stop);
pad.addEventListener('pointercancel', stop);
pad.addEventListener('pointerleave', stop);
document.getElementById('sig-clear')!.addEventListener('click', resetPad);

/** Crop the pad to the drawn strokes and return a PNG. */
async function padToPng(): Promise<{ png: Uint8Array; aspect: number } | undefined> {
  if (!drawn) return undefined;
  const { width, height } = pad;
  const data = padCtx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return undefined;
  const padPx = 8;
  minX = Math.max(0, minX - padPx);
  minY = Math.max(0, minY - padPx);
  maxX = Math.min(width - 1, maxX + padPx);
  maxY = Math.min(height - 1, maxY + padPx);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(pad, minX, minY, w, h, 0, 0, w, h);
  return { png: await canvasPng(out), aspect: w / h };
}

function canvasPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    c.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('Could not encode the signature.'))), 'image/png');
  });
}

/* ------------------------------------------------------------------ */
/* Typed signatures and text                                           */
/* ------------------------------------------------------------------ */
function fontFor(choice: string, size: number): string {
  if (choice === 'Caveat') return `500 ${size}px Caveat, "Segoe Script", "Bradley Hand", cursive`;
  if (choice === 'serif-italic') return `italic ${size}px Georgia, "Times New Roman", serif`;
  return `${size}px ${getComputedStyle(document.body).fontFamily}`;
}

async function textToPng(text: string, font: string, color: string, size = 96): Promise<{ png: Uint8Array; aspect: number }> {
  if (font.includes('Caveat') && 'fonts' in document) {
    try {
      await document.fonts.load(font);
    } catch {
      /* fall back to the generic family */
    }
  }
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  const m = ctx.measureText(text);
  const ascent = m.actualBoundingBoxAscent || size * 0.8;
  const descent = m.actualBoundingBoxDescent || size * 0.25;
  const padPx = Math.round(size * 0.15);
  c.width = Math.ceil(m.width + padPx * 2);
  c.height = Math.ceil(ascent + descent + padPx * 2);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, padPx, padPx + ascent);
  return { png: await canvasPng(c), aspect: c.width / c.height };
}

function syncMode() {
  const mode = radio('sig-mode', 'draw');
  drawBox.hidden = mode !== 'draw';
  typeBox.hidden = mode !== 'type';
  syncPreview();
}
function syncPreview() {
  sigPreview.textContent = sigText.value || 'Your name';
  sigPreview.style.font = fontFor(sigFont.value, 44);
  sigPreview.style.color = sigColor.value;
}
document.querySelectorAll<HTMLInputElement>('input[name="sig-mode"]').forEach((i) => i.addEventListener('change', syncMode));
sigText.addEventListener('input', syncPreview);
sigFont.addEventListener('change', syncPreview);
sigColor.addEventListener('change', syncPreview);
syncMode();

/* ------------------------------------------------------------------ */
/* Page viewer                                                         */
/* ------------------------------------------------------------------ */
function stageWidth(): number {
  return Math.min(stage.clientWidth || 720, 900);
}

async function showPage(index: number) {
  if (!pdf) return;
  current = Math.max(0, Math.min(pageCount - 1, index));
  const size = pageSizes[current]!;
  const scale = stageWidth() / size.w;
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
  paintStamps();
}
document.getElementById('prev-page')!.addEventListener('click', () => void showPage(current - 1));
document.getElementById('next-page')!.addEventListener('click', () => void showPage(current + 1));

let resizeTimer: number | undefined;
window.addEventListener('resize', () => {
  if (!pdf) return;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => void showPage(current), 150);
});

function paintStamps() {
  layer.innerHTML = '';
  const W = pageCanvas.clientWidth;
  const H = pageCanvas.clientHeight;
  for (const p of placements.filter((s) => s.page === current)) {
    const el = document.createElement('div');
    el.className = `stamp stamp-${p.kind}`;
    el.dataset.id = String(p.id);
    el.tabIndex = 0;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${p.kind} placed on page ${current + 1}. Drag to move, arrow keys to nudge, Delete to remove.`);
    el.style.left = `${p.x * W}px`;
    el.style.top = `${p.y * H}px`;
    el.style.width = `${p.width * W}px`;
    el.style.height = `${p.height * H}px`;
    const img = document.createElement('img');
    img.src = p.url;
    img.alt = '';
    img.draggable = false;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'stamp-remove';
    del.textContent = '×';
    del.setAttribute('aria-label', `Remove this ${p.kind}`);
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removePlacement(p.id);
    });
    const handle = document.createElement('div');
    handle.className = 'stamp-handle';
    handle.setAttribute('aria-hidden', 'true');
    el.append(img, del, handle);
    wireDrag(el, handle, p);
    layer.append(el);
  }
  const n = placements.length;
  placementCount.textContent = n ? `${n} item${n === 1 ? '' : 's'} placed on ${new Set(placements.map((s) => s.page)).size} page${new Set(placements.map((s) => s.page)).size === 1 ? '' : 's'}` : '';
  shell.hideError();
  shell.setHint(n ? '' : 'Next: draw or type your signature above, then press "Add signature to this page".');
}

function removePlacement(id: number) {
  const p = placements.find((s) => s.id === id);
  if (p) URL.revokeObjectURL(p.url);
  placements = placements.filter((s) => s.id !== id);
  paintStamps();
}

function wireDrag(el: HTMLElement, handle: HTMLElement, p: Placement) {
  let mode: 'move' | 'resize' | undefined;
  let startX = 0;
  let startY = 0;
  let orig = { x: 0, y: 0, width: 0, height: 0 };
  const W = () => pageCanvas.clientWidth;
  const H = () => pageCanvas.clientHeight;
  const begin = (e: PointerEvent, m: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    mode = m;
    startX = e.clientX;
    startY = e.clientY;
    orig = { x: p.x, y: p.y, width: p.width, height: p.height };
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-active');
    el.focus();
  };
  el.addEventListener('pointerdown', (e) => begin(e, 'move'));
  handle.addEventListener('pointerdown', (e) => begin(e, 'resize'));
  el.addEventListener('pointermove', (e) => {
    if (!mode) return;
    const dx = (e.clientX - startX) / W();
    const dy = (e.clientY - startY) / H();
    if (mode === 'move') {
      p.x = clamp(orig.x + dx, 0, 1 - p.width);
      p.y = clamp(orig.y + dy, 0, 1 - p.height);
    } else {
      // Keep the aspect ratio; width drives.
      const minW = 0.04;
      const w = clamp(orig.width + dx, minW, 1 - p.x);
      const h = (w * W()) / p.aspect / H();
      if (p.y + h <= 1) {
        p.width = w;
        p.height = h;
      }
    }
    el.style.left = `${p.x * W()}px`;
    el.style.top = `${p.y * H()}px`;
    el.style.width = `${p.width * W()}px`;
    el.style.height = `${p.height * H()}px`;
  });
  const end = () => {
    mode = undefined;
    el.classList.remove('is-active');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removePlacement(p.id);
      return;
    }
    if (e.key === 'ArrowLeft') p.x = clamp(p.x - step, 0, 1 - p.width);
    else if (e.key === 'ArrowRight') p.x = clamp(p.x + step, 0, 1 - p.width);
    else if (e.key === 'ArrowUp') p.y = clamp(p.y - step, 0, 1 - p.height);
    else if (e.key === 'ArrowDown') p.y = clamp(p.y + step, 0, 1 - p.height);
    else if (e.key === '+' || e.key === '=') resizeBy(p, 1.1);
    else if (e.key === '-') resizeBy(p, 1 / 1.1);
    else return;
    e.preventDefault();
    paintStamps();
    layer.querySelector<HTMLElement>(`[data-id="${p.id}"]`)?.focus();
  });
}

function resizeBy(p: Placement, factor: number) {
  const w = clamp(p.width * factor, 0.04, 1 - p.x);
  const h = (w * pageCanvas.clientWidth) / p.aspect / pageCanvas.clientHeight;
  if (p.y + h <= 1) {
    p.width = w;
    p.height = h;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ */
/* Placing                                                             */
/* ------------------------------------------------------------------ */
async function addPlacement(kind: Placement['kind'], make: () => Promise<{ png: Uint8Array; aspect: number } | undefined>) {
  if (!pdf) return;
  shell.hideError();
  const made = await make();
  if (!made) {
    shell.showError(kind === 'signature' ? (radio('sig-mode', 'draw') === 'draw' ? 'Draw your signature first.' : 'Type your name first.') : 'Enter some text first.');
    return;
  }
  const W = pageCanvas.clientWidth;
  const H = pageCanvas.clientHeight;
  // Default width: signatures about a third of the page, small text about a fifth.
  const targetW = kind === 'signature' ? 0.32 : kind === 'initials' ? 0.12 : 0.2;
  const width = Math.min(targetW, 0.9);
  const height = (width * W) / made.aspect / H;
  const url = URL.createObjectURL(new Blob([made.png as BlobPart], { type: 'image/png' }));
  const place: Placement = {
    id: nextId++,
    page: current,
    x: kind === 'signature' ? 0.55 : 0.1,
    y: clamp(kind === 'signature' ? 0.78 : 0.85, 0, 1 - height),
    width,
    height,
    png: made.png,
    url,
    aspect: made.aspect,
    kind,
  };
  // Stagger repeated placements so they do not hide each other.
  const same = placements.filter((s) => s.page === current && s.kind === kind).length;
  place.y = clamp(place.y - same * 0.06, 0, 1 - height);
  placements.push(place);
  paintStamps();
  layer.querySelector<HTMLElement>(`[data-id="${place.id}"]`)?.focus();
}

document.getElementById('add-signature')!.addEventListener('click', () =>
  void addPlacement('signature', async () => {
    if (radio('sig-mode', 'draw') === 'draw') return padToPng();
    const text = sigText.value.trim();
    if (!text) return undefined;
    return textToPng(text, fontFor(sigFont.value, 120), sigColor.value, 120);
  }),
);
document.getElementById('add-initials')!.addEventListener('click', () =>
  void addPlacement('initials', async () => {
    const source = sigText.value.trim() || window.prompt('Your initials', '') || '';
    const initials = source.length <= 4 ? source : source.split(/\s+/).map((w) => w[0] ?? '').join('');
    if (!initials) return undefined;
    return textToPng(initials.toUpperCase(), fontFor(sigFont.value === 'sans' ? 'sans' : 'Caveat', 110), sigColor.value, 110);
  }),
);
document.getElementById('add-date')!.addEventListener('click', () =>
  void addPlacement('date', async () => {
    const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    return textToPng(date, fontFor('sans', 64), sigColor.value, 64);
  }),
);
document.getElementById('add-text')!.addEventListener('click', () =>
  void addPlacement('text', async () => {
    const text = window.prompt('Text to place on the page (a name, a title, "Approved")', str('sig-text'))?.trim();
    if (!text) return undefined;
    return textToPng(text, fontFor('sans', 64), sigColor.value, 64);
  }),
);

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
async function reset() {
  for (const p of placements) URL.revokeObjectURL(p.url);
  placements = [];
  layer.innerHTML = '';
  placementCount.textContent = '';
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
    // Validate with pdf-lib first so the error message is the friendly one.
    const doc = await loadDocument(bytes);
    pageSizes = doc.getPages().map((p) => displayedSize(p));
    pdf = await openWithPdfJs(bytes);
    pageCount = pdf.numPages;
    panel.hidden = false;
    await showPage(0);
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (!pdf) await loadDocument(new Uint8Array(await entry.file.arrayBuffer()));
    if (placements.length === 0) throw new Error('Add your signature to a page first: draw or type it, then click "Add signature to this page".');
    progress.set('Placing signatures', 0.2);
    const stamps: Stamp[] = placements.map((p) => ({ page: p.page, png: p.png, x: p.x, y: p.y, width: p.width, height: p.height }));
    const bytes = await stampPdf(new Uint8Array(await entry.file.arrayBuffer()), stamps, (done, total) => progress.set(`Placing ${done} of ${total}`, 0.2 + (0.7 * done) / total));
    progress.set('Done', 1);
    const pages = new Set(placements.map((p) => p.page)).size;
    const out: OutputFile = {
      name: suffixName(entry.file.name, '-signed', 'pdf'),
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      note: `${placements.length} item${placements.length === 1 ? '' : 's'} on ${pages} page${pages === 1 ? '' : 's'}`,
    };
    return [out];
  },
  resultsTitle: () => 'Signed',
});
