import { createShell, radio } from '../lib/shell';
import { closePdfJs, displayedSize, loadDocument, openWithPdfJs, pageThumbnail, renderPage } from '../lib/pdf';
import type * as PdfJs from 'pdfjs-dist';
import { suffixName, type OutputFile } from '../lib/files';
import { InputError, NamedError } from '../lib/input-error';
import { applyEdits, BASELINE, drawableAsText, isIdentity, PICTURE_PX, type Edit, type EditFont } from '../lib/pdf-edit';

const panel = document.getElementById('edit-panel')!;
const stage = document.getElementById('stage')!;
const pageCanvas = document.getElementById('page-canvas') as HTMLCanvasElement;
const layer = document.getElementById('edit-layer')!;
const pageLabel = document.getElementById('page-label')!;
const countLabel = document.getElementById('placement-count')!;
const grid = document.getElementById('page-grid')!;
const info = document.getElementById('page-info')!;
const undoButton = document.getElementById('undo') as HTMLButtonElement;
const textInput = document.getElementById('edit-text') as HTMLInputElement;
const fontSelect = document.getElementById('edit-font') as HTMLSelectElement;
const sizeSelect = document.getElementById('edit-size') as HTMLSelectElement;
const colorSelect = document.getElementById('edit-color') as HTMLSelectElement;
const customColor = document.getElementById('edit-custom') as HTMLInputElement;
const coverColor = document.getElementById('cover-color') as HTMLSelectElement;
const penColor = document.getElementById('pen-color') as HTMLSelectElement;
const penWidth = document.getElementById('pen-width') as HTMLSelectElement;
const imageFile = document.getElementById('edit-image-file') as HTMLInputElement;

/** One thing added to a page. Positions are fractions of the page as shown, origin top-left. */
interface Item {
  id: number;
  page: number;
  kind: Edit['kind'];
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  size?: number;
  font?: EditFont;
  png?: Uint8Array;
  url?: string;
  /** Pixel size of the PNG; for text that is a picture, the line rendered at PICTURE_PX. */
  pxW?: number;
  pxH?: number;
  /** Text drawn as a picture because a standard PDF font cannot draw it. */
  picture?: boolean;
  points?: [number, number][];
  thickness?: number;
}

let pdf: PdfJs.PDFDocumentProxy | undefined;
let total = 0;
/** Source page index shown in the viewer. */
let current = 0;
let pageSizes: { w: number; h: number }[] = [];
let items: Item[] = [];
let nextId = 1;
let order: number[] = [];
let turn: Record<number, number> = {};
let thumbs: string[] = [];
let undos: (() => void)[] = [];
let dragFrom = -1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pageW = () => pageCanvas.clientWidth || 1;
const pageH = () => pageCanvas.clientHeight || 1;
/** Screen pixels per PDF point on the shown page. */
const pxPerPt = () => pageW() / pageSizes[current]!.w;
const CSS_FONT: Record<EditFont, string> = { helvetica: 'Helvetica, Arial, sans-serif', times: '"Times New Roman", Times, serif', courier: '"Courier New", Courier, monospace' };

function ink(): string {
  return colorSelect.value === 'custom' ? customColor.value : colorSelect.value;
}

/* ------------------------------------------------------------------ */
/* Modes                                                               */
/* ------------------------------------------------------------------ */
function syncMode() {
  const mode = radio('edit-mode', 'text');
  for (const m of ['text', 'cover', 'highlight', 'draw', 'image']) document.getElementById(`opts-${m}`)!.hidden = m !== mode;
  customColor.hidden = colorSelect.value !== 'custom';
  layer.className = `stamp-layer edit-layer is-${mode}`;
}
document.querySelectorAll<HTMLInputElement>('input[name="edit-mode"]').forEach((i) => i.addEventListener('change', syncMode));
colorSelect.addEventListener('change', syncMode);
syncMode();

/* ------------------------------------------------------------------ */
/* Undo                                                                */
/* ------------------------------------------------------------------ */
function pushUndo(fn: () => void) {
  undos.push(fn);
  undoButton.disabled = false;
}
undoButton.addEventListener('click', () => {
  const fn = undos.pop();
  fn?.();
  undoButton.disabled = undos.length === 0;
});

/* ------------------------------------------------------------------ */
/* Viewer                                                              */
/* ------------------------------------------------------------------ */
async function showPage(src: number) {
  if (!pdf || !order.length) return;
  current = order.includes(src) ? src : order[0]!;
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
  pageLabel.textContent = `Page ${current + 1} of ${total}`;
  const pos = order.indexOf(current);
  (document.getElementById('prev-page') as HTMLButtonElement).disabled = pos <= 0;
  (document.getElementById('next-page') as HTMLButtonElement).disabled = pos >= order.length - 1;
  paintItems();
  paintGrid();
}
document.getElementById('prev-page')!.addEventListener('click', () => void showPage(order[order.indexOf(current) - 1] ?? current));
document.getElementById('next-page')!.addEventListener('click', () => void showPage(order[order.indexOf(current) + 1] ?? current));

let resizeTimer: number | undefined;
window.addEventListener('resize', () => {
  if (!pdf) return;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => void showPage(current), 150);
});

function pointOf(e: PointerEvent): [number, number] {
  const r = layer.getBoundingClientRect();
  return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)];
}

/* ------------------------------------------------------------------ */
/* Items on the page                                                   */
/* ------------------------------------------------------------------ */
function layout(el: HTMLElement, it: Item) {
  el.style.left = `${it.x * pageW()}px`;
  el.style.top = `${it.y * pageH()}px`;
  if (it.kind === 'text' && !it.picture) {
    el.style.width = '';
    el.style.height = '';
  } else {
    el.style.width = `${it.width * pageW()}px`;
    el.style.height = `${it.height * pageH()}px`;
  }
}

function svgFor(it: Item): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${it.width * pageW()} ${it.height * pageH()}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(ns, 'polyline');
  path.setAttribute('points', it.points!.map(([px, py]) => `${(px - it.x) * pageW()},${(py - it.y) * pageH()}`).join(' '));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', it.color);
  path.setAttribute('stroke-width', String(it.thickness! * pxPerPt()));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function paintItems() {
  layer.innerHTML = '';
  for (const it of items.filter((s) => s.page === current)) {
    const el = document.createElement('div');
    el.className = `edit-item edit-${it.kind}`;
    el.dataset.id = String(it.id);
    el.tabIndex = 0;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${it.kind === 'text' ? `Text “${it.text}”` : it.kind} on page ${current + 1}. Drag to move, arrow keys to nudge, Delete to remove.`);
    layout(el, it);
    if (it.kind === 'text' && !it.picture) {
      const t = document.createElement('span');
      t.className = 'edit-words';
      t.textContent = it.text!;
      t.style.fontFamily = CSS_FONT[it.font!];
      t.style.fontSize = `${it.size! * pxPerPt()}px`;
      t.style.color = it.color;
      el.append(t);
    } else if (it.kind === 'cover' || it.kind === 'highlight') {
      el.style.background = it.kind === 'highlight' ? `${it.color}59` : it.color;
      if (it.kind === 'highlight') el.style.mixBlendMode = 'multiply';
    } else if (it.kind === 'draw') {
      el.append(svgFor(it));
    } else {
      const img = document.createElement('img');
      img.src = it.url!;
      img.alt = '';
      img.draggable = false;
      el.append(img);
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'stamp-remove';
    del.textContent = '×';
    del.setAttribute('aria-label', `Remove this ${it.kind}`);
    del.addEventListener('pointerdown', (e) => e.stopPropagation());
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeItem(it.id);
    });
    el.append(del);
    const resizable = it.kind === 'cover' || it.kind === 'highlight' || it.kind === 'image';
    let handle: HTMLElement | undefined;
    if (resizable) {
      handle = document.createElement('div');
      handle.className = 'stamp-handle';
      handle.setAttribute('aria-hidden', 'true');
      el.append(handle);
    }
    wireDrag(el, handle, it);
    layer.append(el);
  }
  const n = items.length;
  const pages = new Set(items.map((s) => s.page)).size;
  countLabel.textContent = n ? `${n} item${n === 1 ? '' : 's'} on ${pages} page${pages === 1 ? '' : 's'}` : '';
  shell.hideError();
}

function addItem(it: Item) {
  items.push(it);
  pushUndo(() => {
    items = items.filter((s) => s !== it);
    if (it.url) URL.revokeObjectURL(it.url);
    paintItems();
  });
  paintItems();
  layer.querySelector<HTMLElement>(`[data-id="${it.id}"]`)?.focus();
}

function removeItem(id: number) {
  const it = items.find((s) => s.id === id);
  if (!it) return;
  items = items.filter((s) => s !== it);
  pushUndo(() => {
    items.push(it);
    paintItems();
  });
  paintItems();
}

function wireDrag(el: HTMLElement, handle: HTMLElement | undefined, it: Item) {
  let mode: 'move' | 'resize' | undefined;
  let startX = 0;
  let startY = 0;
  let orig = { x: 0, y: 0, width: 0, height: 0 };
  let origPts: [number, number][] = [];
  const sizeOf = () => (it.kind === 'text' && !it.picture ? { w: el.offsetWidth / pageW(), h: el.offsetHeight / pageH() } : { w: it.width, h: it.height });
  const shift = (nx: number, ny: number) => {
    it.x = nx;
    it.y = ny;
    if (it.points) it.points = origPts.map(([px, py]) => [px + (nx - orig.x), py + (ny - orig.y)] as [number, number]);
  };
  const begin = (e: PointerEvent, m: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    mode = m;
    startX = e.clientX;
    startY = e.clientY;
    orig = { x: it.x, y: it.y, width: it.width, height: it.height };
    origPts = it.points ? it.points.map((p) => [...p] as [number, number]) : [];
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-active');
    el.focus();
  };
  el.addEventListener('pointerdown', (e) => begin(e, 'move'));
  handle?.addEventListener('pointerdown', (e) => begin(e, 'resize'));
  el.addEventListener('pointermove', (e) => {
    if (!mode) return;
    const dx = (e.clientX - startX) / pageW();
    const dy = (e.clientY - startY) / pageH();
    const s = sizeOf();
    if (mode === 'move') {
      shift(clamp(orig.x + dx, 0, 1 - s.w), clamp(orig.y + dy, 0, 1 - s.h));
    } else if (it.kind === 'image') {
      const aspect = (orig.width * pageW()) / (orig.height * pageH());
      const w = clamp(orig.width + dx, 0.04, 1 - it.x);
      const h = (w * pageW()) / aspect / pageH();
      if (it.y + h <= 1) {
        it.width = w;
        it.height = h;
      }
    } else {
      it.width = clamp(orig.width + dx, 0.01, 1 - it.x);
      it.height = clamp(orig.height + dy, 0.01, 1 - it.y);
    }
    layout(el, it);
  });
  const end = () => {
    if (mode) {
      const before = { ...orig };
      const beforePts = origPts;
      if (before.x !== it.x || before.y !== it.y || before.width !== it.width || before.height !== it.height) {
        pushUndo(() => {
          Object.assign(it, before);
          if (it.points) it.points = beforePts;
          paintItems();
        });
      }
    }
    mode = undefined;
    el.classList.remove('is-active');
    if (it.kind === 'draw') paintItems();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeItem(it.id);
      return;
    }
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    orig = { x: it.x, y: it.y, width: it.width, height: it.height };
    origPts = it.points ? it.points.map((p) => [...p] as [number, number]) : [];
    const s = sizeOf();
    shift(clamp(it.x + d[0]!, 0, 1 - s.w), clamp(it.y + d[1]!, 0, 1 - s.h));
    paintItems();
    layer.querySelector<HTMLElement>(`[data-id="${it.id}"]`)?.focus();
  });
}

/* ------------------------------------------------------------------ */
/* Making things: click and drag on the page                           */
/* ------------------------------------------------------------------ */
let gesture: { mode: string; start: [number, number]; pts: [number, number][]; draft: HTMLElement } | undefined;

async function textToPicture(text: string, font: EditFont, color: string): Promise<{ png: Uint8Array; pxW: number; pxH: number }> {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const face = `${PICTURE_PX}px ${CSS_FONT[font]}`;
  ctx.font = face;
  const m = ctx.measureText(text);
  // One line of the given size, baseline where real text puts it, so the two line up.
  c.width = Math.ceil(m.width) + 4;
  c.height = PICTURE_PX;
  ctx.font = face;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 2, PICTURE_PX * BASELINE);
  const png = await canvasPng(c);
  return { png, pxW: c.width, pxH: c.height };
}

function canvasPng(c: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    (c as HTMLCanvasElement).toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new NamedError('EditPdfFailed', 'Could not encode the picture.'))), 'image/png');
  });
}

async function placeText(at: [number, number]) {
  const text = textInput.value.trim();
  if (!text) {
    shell.showError('Type the text you want to add in the box above, then click the page.');
    textInput.focus();
    return;
  }
  const font = fontSelect.value as EditFont;
  const size = Number(sizeSelect.value);
  const color = ink();
  const it: Item = { id: nextId++, page: current, kind: 'text', x: at[0], y: at[1], width: 0, height: 0, color, text, size, font };
  if (!(await drawableAsText(text, font))) {
    const pic = await textToPicture(text, font, color);
    it.picture = true;
    it.png = pic.png;
    it.pxW = pic.pxW;
    it.pxH = pic.pxH;
    it.url = URL.createObjectURL(new Blob([pic.png as BlobPart], { type: 'image/png' }));
    it.width = (pic.pxW * (size / PICTURE_PX) * pxPerPt()) / pageW();
    it.height = (pic.pxH * (size / PICTURE_PX) * pxPerPt()) / pageH();
  }
  // Keep it on the page: the box is about a line high.
  it.y = clamp(it.y, 0, 1 - (size * pxPerPt() * 1.2) / pageH());
  if (it.picture) {
    it.x = clamp(it.x, 0, 1 - it.width);
  } else {
    it.x = clamp(it.x, 0, 0.98);
  }
  addItem(it);
}

layer.addEventListener('pointerdown', (e) => {
  if (e.target !== layer || !pdf) return;
  const mode = radio('edit-mode', 'text');
  const p = pointOf(e);
  if (mode === 'text') {
    void placeText(p);
    return;
  }
  if (mode === 'image') {
    document.getElementById('edit-image-choose')!.click();
    return;
  }
  e.preventDefault();
  layer.setPointerCapture(e.pointerId);
  const draft = document.createElement('div');
  draft.className = 'edit-draft';
  layer.append(draft);
  gesture = { mode, start: p, pts: [p], draft };
});

layer.addEventListener('pointermove', (e) => {
  if (!gesture) return;
  const p = pointOf(e);
  if (gesture.mode === 'draw') {
    gesture.pts.push(p);
    const xs = gesture.pts.map((q) => q[0]);
    const ys = gesture.pts.map((q) => q[1]);
    Object.assign(gesture.draft.style, {
      left: `${Math.min(...xs) * pageW()}px`,
      top: `${Math.min(...ys) * pageH()}px`,
      width: `${(Math.max(...xs) - Math.min(...xs)) * pageW()}px`,
      height: `${(Math.max(...ys) - Math.min(...ys)) * pageH()}px`,
    });
  } else {
    const [sx, sy] = gesture.start;
    Object.assign(gesture.draft.style, {
      left: `${Math.min(sx, p[0]) * pageW()}px`,
      top: `${Math.min(sy, p[1]) * pageH()}px`,
      width: `${Math.abs(p[0] - sx) * pageW()}px`,
      height: `${Math.abs(p[1] - sy) * pageH()}px`,
    });
    gesture.pts = [gesture.start, p];
  }
});

function finishGesture() {
  if (!gesture) return;
  const g = gesture;
  gesture = undefined;
  g.draft.remove();
  const base = { id: nextId++, page: current };
  if (g.mode === 'draw') {
    const xs = g.pts.map((q) => q[0]);
    const ys = g.pts.map((q) => q[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const thickness = Number(penWidth.value);
    addItem({
      ...base,
      kind: 'draw',
      x,
      y,
      // At least a pixel, so a straight line or a dot still has a box to grab.
      width: Math.max(Math.max(...xs) - x, 1 / pageW()),
      height: Math.max(Math.max(...ys) - y, 1 / pageH()),
      color: penColor.value,
      points: g.pts,
      thickness,
    });
    return;
  }
  const [ax, ay] = g.start;
  const [bx, by] = g.pts[g.pts.length - 1]!;
  const width = Math.abs(bx - ax);
  const height = Math.abs(by - ay);
  if (width * pageW() < 4 || height * pageH() < 4) return;
  addItem({ ...base, kind: g.mode as 'cover' | 'highlight', x: Math.min(ax, bx), y: Math.min(ay, by), width, height, color: g.mode === 'cover' ? coverColor.value : '#ffd400' });
}
layer.addEventListener('pointerup', finishGesture);
layer.addEventListener('pointercancel', finishGesture);

/* Image */
document.getElementById('edit-image-choose')!.addEventListener('click', () => imageFile.click());
imageFile.addEventListener('change', () => {
  const f = imageFile.files?.[0];
  imageFile.value = '';
  if (f && pdf) void placeImage(f);
});

const IMAGE_EDGE = 2000;
async function placeImage(blob: Blob) {
  shell.hideError();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    shell.showError('This file is not an image this page can read. Try a PNG, JPG or WebP file.');
    return;
  }
  try {
    const k = Math.min(1, IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bitmap.width * k));
    c.height = Math.max(1, Math.round(bitmap.height * k));
    c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height);
    const png = await canvasPng(c);
    const aspect = c.width / c.height;
    let width = 0.3;
    let height = (width * pageW()) / aspect / pageH();
    if (height > 0.6) {
      height = 0.6;
      width = (height * pageH() * aspect) / pageW();
    }
    addItem({ id: nextId++, page: current, kind: 'image', x: 0.1, y: 0.1, width, height, color: '', png, url: URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' })), pxW: c.width, pxH: c.height });
  } finally {
    bitmap.close();
  }
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */
function snapshotPages() {
  const o = [...order];
  const t = { ...turn };
  pushUndo(() => {
    order = o;
    turn = t;
    void showPage(order.includes(current) ? current : order[0]!);
  });
}

function movePage(from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
  snapshotPages();
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item!);
  paintGrid();
  syncPageButtons();
}

function syncPageButtons() {
  const pos = order.indexOf(current);
  (document.getElementById('prev-page') as HTMLButtonElement).disabled = pos <= 0;
  (document.getElementById('next-page') as HTMLButtonElement).disabled = pos >= order.length - 1;
}

function button(text: string, label: string, onClick: () => void, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-icon btn-ghost';
  b.textContent = text;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function paintGrid() {
  grid.innerHTML = '';
  order.forEach((src, pos) => {
    const cell = document.createElement('div');
    cell.className = `page-thumb reorder-cell${src === current ? ' is-current' : ''}`;
    cell.setAttribute('role', 'listitem');
    cell.draggable = true;
    cell.dataset.src = String(src);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'thumb-open';
    open.setAttribute('aria-label', `Edit page ${src + 1}`);
    const frame = document.createElement('span');
    frame.className = 'thumb-frame';
    const img = document.createElement('img');
    img.alt = `Page ${src + 1}`;
    img.src = thumbs[src] ?? '';
    img.draggable = false;
    const t = ((turn[src] ?? 0) % 360 + 360) % 360;
    if (t) img.style.transform = `rotate(${t}deg)${t === 90 || t === 270 ? ' scale(0.72)' : ''}`;
    frame.append(img);
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = `${pos + 1}. was page ${src + 1}${t ? `, turned ${t}°` : ''}`;
    open.append(frame, label);
    open.addEventListener('click', () => void showPage(src));
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.append(
      button('←', `Move page ${src + 1} left`, () => movePage(pos, pos - 1), pos === 0),
      button('→', `Move page ${src + 1} right`, () => movePage(pos, pos + 1), pos === order.length - 1),
      button('↻', `Rotate page ${src + 1} a quarter turn`, () => {
        snapshotPages();
        turn[src] = (((turn[src] ?? 0) + 90) % 360);
        paintGrid();
      }),
      button('×', `Delete page ${src + 1}`, () => {
        snapshotPages();
        order.splice(pos, 1);
        if (src === current) void showPage(order[Math.min(pos, order.length - 1)]!);
        else paintGrid();
        syncPageButtons();
      }, order.length === 1),
    );
    cell.addEventListener('dragstart', (e) => {
      dragFrom = pos;
      cell.classList.add('is-dragging');
      e.dataTransfer?.setData('text/plain', String(pos));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    cell.addEventListener('dragend', () => {
      dragFrom = -1;
      grid.querySelectorAll('.is-dragging, .is-target').forEach((el) => el.classList.remove('is-dragging', 'is-target'));
    });
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cell.classList.add('is-target');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('is-target'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const from = dragFrom >= 0 ? dragFrom : Number(e.dataTransfer?.getData('text/plain'));
      if (Number.isFinite(from)) movePage(from, pos);
    });
    cell.append(open, controls);
    grid.append(cell);
  });
  const deleted = total - order.length;
  info.textContent = `${total} page${total === 1 ? '' : 's'}${deleted > 0 ? `, ${deleted} deleted` : ''}`;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
async function reset() {
  for (const it of items) if (it.url) URL.revokeObjectURL(it.url);
  items = [];
  undos = [];
  undoButton.disabled = true;
  layer.innerHTML = '';
  countLabel.textContent = '';
  grid.innerHTML = '';
  if (pdf) {
    const old = pdf;
    pdf = undefined;
    await closePdfJs(old);
  }
  total = 0;
  order = [];
  turn = {};
  thumbs = [];
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
    total = pdf.numPages;
    order = Array.from({ length: total }, (_, i) => i);
    panel.hidden = false;
    await showPage(0);
    const doneFor = pdf;
    for (let i = 0; i < total; i++) {
      if (pdf !== doneFor) return;
      thumbs[i] = await pageThumbnail(doneFor, i + 1, 150);
      grid.querySelectorAll<HTMLImageElement>('img').forEach((el) => {
        if (el.alt === `Page ${i + 1}`) el.src = thumbs[i]!;
      });
    }
  },
  async process(files, progress) {
    const entry = files[0]!;
    const source = new Uint8Array(await entry.file.arrayBuffer());
    if (!pdf) await loadDocument(source);
    const pageLayout = { order, turn };
    if (items.length === 0 && isIdentity(pageLayout, total)) throw new InputError('Make a change first: add text, a cover, a highlight, a drawing or an image, or rotate, delete or reorder a page.');
    progress.set('Writing the edits', 0.2);
    const edits: Edit[] = items.map((it): Edit => {
      if (it.kind === 'text') {
        return {
          kind: 'text',
          page: it.page,
          x: it.x,
          y: it.y,
          text: it.text!,
          size: it.size!,
          color: it.color,
          font: it.font!,
          picture: it.picture ? { png: it.png!, width: it.pxW!, height: it.pxH! } : undefined,
        };
      }
      if (it.kind === 'draw') return { kind: 'draw', page: it.page, points: it.points!, color: it.color, thickness: it.thickness! };
      if (it.kind === 'image') return { kind: 'image', page: it.page, x: it.x, y: it.y, width: it.width, height: it.height, png: it.png! };
      return { kind: it.kind, page: it.page, x: it.x, y: it.y, width: it.width, height: it.height, color: it.color };
    });
    const bytes = await applyEdits(source, edits, pageLayout, (done, n) => progress.set(`Placing ${done} of ${n}`, 0.2 + (0.7 * done) / n));
    progress.set('Done', 1);
    const deleted = total - order.length;
    const out: OutputFile = {
      name: suffixName(entry.file.name, '-edited', 'pdf'),
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      note: `${items.length} edit${items.length === 1 ? '' : 's'}, ${order.length} page${order.length === 1 ? '' : 's'}${deleted ? ` (${deleted} deleted)` : ''}`,
    };
    return [out];
  },
  resultsTitle: () => 'Edited',
});
