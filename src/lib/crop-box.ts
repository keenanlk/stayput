import { radio } from './shell';

/**
 * The crop box on CropStage.astro: draws a picture (an image, or a frame of a
 * video) and lets the user drag, resize or type a crop rectangle, with the
 * aspect ratio select, the pixel fields and the reset button from the tool's
 * options. Used by Crop image and Crop video; the tool decides what to do with
 * the rectangle. The optional "shape" radio (rectangle or circle) only changes
 * how the box is drawn.
 */
/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('crop-panel');
const stage = $('crop-stage');
const canvas = $<HTMLCanvasElement>('crop-canvas');
const box = $('crop-box');
const sizeLabel = $('crop-size');
const fields = {
  x: $<HTMLInputElement>('crop-x'),
  y: $<HTMLInputElement>('crop-y'),
  w: $<HTMLInputElement>('crop-w'),
  h: $<HTMLInputElement>('crop-h'),
};
const aspectSelect = $<HTMLSelectElement>('aspect');

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const MIN = 8;
let srcW = 0;
let srcH = 0;
/** Crop rectangle in source pixels. */
let rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
/** Displayed pixels per source pixel. */
let scale = 1;

function aspect(): number | undefined {
  const v = aspectSelect.value;
  if (v === 'free') return undefined;
  if (v === 'original') return srcW && srcH ? srcW / srcH : undefined;
  const [a, b] = v.split(':').map(Number);
  return a && b ? a / b : undefined;
}

/** Largest rectangle of the given aspect that fits the image, centred. */
function fitRect(a?: number): Rect {
  if (!a) return { x: 0, y: 0, w: srcW, h: srcH };
  let w = srcW;
  let h = Math.round(w / a);
  if (h > srcH) {
    h = srcH;
    w = Math.round(h * a);
  }
  return { x: Math.round((srcW - w) / 2), y: Math.round((srcH - h) / 2), w: Math.max(MIN, w), h: Math.max(MIN, h) };
}

function clampMove(r: Rect): Rect {
  const w = Math.min(r.w, srcW);
  const h = Math.min(r.h, srcH);
  return { x: Math.min(Math.max(0, r.x), srcW - w), y: Math.min(Math.max(0, r.y), srcH - h), w, h };
}

/**
 * Resize from a handle. Edges named in the handle move with the pointer; the
 * opposite edges stay put. With an aspect ratio the width leads, except on the
 * top and bottom handles where the height does.
 */
function resize(start: Rect, handle: string, dx: number, dy: number, a?: number): Rect {
  let w = start.w;
  let h = start.h;
  if (handle.includes('e')) w = start.w + dx;
  if (handle.includes('w')) w = start.w - dx;
  if (handle.includes('s')) h = start.h + dy;
  if (handle.includes('n')) h = start.h - dy;
  w = Math.max(MIN, w);
  h = Math.max(MIN, h);
  const anchorRight = handle.includes('w');
  const anchorBottom = handle.includes('n');
  if (a) {
    if (handle === 'n' || handle === 's') w = h * a;
    else h = w / a;
  }
  const maxW = anchorRight ? start.x + start.w : srcW - start.x;
  const maxH = anchorBottom ? start.y + start.h : srcH - start.y;
  if (w > maxW) {
    w = maxW;
    if (a) h = w / a;
  }
  if (h > maxH) {
    h = maxH;
    if (a) w = h * a;
  }
  w = Math.max(MIN, Math.round(w));
  h = Math.max(MIN, Math.round(h));
  const x = anchorRight ? start.x + start.w - w : start.x;
  const y = anchorBottom ? start.y + start.h - h : start.y;
  return { x, y, w, h };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */
function measure() {
  scale = srcW ? canvas.clientWidth / srcW : 1;
}

function layout() {
  measure();
  box.style.left = `${rect.x * scale}px`;
  box.style.top = `${rect.y * scale}px`;
  box.style.width = `${rect.w * scale}px`;
  box.style.height = `${rect.h * scale}px`;
  box.classList.toggle('is-circle', radio('shape', 'rect') === 'circle');
  fields.x.value = String(rect.x);
  fields.y.value = String(rect.y);
  fields.w.value = String(rect.w);
  fields.h.value = String(rect.h);
  sizeLabel.textContent = `${rect.w} × ${rect.h} px.`;
  panel.dataset.rect = `${rect.x},${rect.y},${rect.w},${rect.h}`;
}

function setRect(r: Rect) {
  rect = clampMove({ x: Math.round(r.x), y: Math.round(r.y), w: Math.max(MIN, Math.round(r.w)), h: Math.max(MIN, Math.round(r.h)) });
  layout();
}

function show(source: CanvasImageSource, width: number, height: number) {
  srcW = width;
  srcH = height;
  // Draw at most ~2000px wide; the CSS scales the canvas to fit the panel.
  const previewScale = Math.min(1, 2000 / srcW, 2000 / srcH);
  canvas.width = Math.max(1, Math.round(srcW * previewScale));
  canvas.height = Math.max(1, Math.round(srcH * previewScale));
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const f of Object.values(fields)) f.max = String(Math.max(srcW, srcH));
  panel.hidden = false;
  setRect(fitRect(aspect()));
}

function hide() {
  srcW = srcH = 0;
  panel.hidden = true;
}

new ResizeObserver(() => {
  if (!panel.hidden) layout();
}).observe(stage);

/* ------------------------------------------------------------------ */
/* Pointer interaction                                                 */
/* ------------------------------------------------------------------ */
let drag: { handle: string; startX: number; startY: number; start: Rect } | undefined;

box.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const handle = (e.target as HTMLElement).dataset.handle ?? 'move';
  drag = { handle, startX: e.clientX, startY: e.clientY, start: { ...rect } };
  box.setPointerCapture(e.pointerId);
  box.focus({ preventScroll: true });
});
box.addEventListener('pointermove', (e) => {
  if (!drag) return;
  measure();
  const dx = (e.clientX - drag.startX) / scale;
  const dy = (e.clientY - drag.startY) / scale;
  if (drag.handle === 'move') setRect({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy });
  else setRect(resize(drag.start, drag.handle, dx, dy, aspect()));
});
const endDrag = () => {
  drag = undefined;
};
box.addEventListener('pointerup', endDrag);
box.addEventListener('pointercancel', endDrag);
// Drawing a fresh box on the image itself, outside the current one.
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || box.contains(e.target as Node) || !srcW) return;
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  measure();
  const x = Math.min(srcW - MIN, Math.max(0, (e.clientX - r.left) / scale));
  const y = Math.min(srcH - MIN, Math.max(0, (e.clientY - r.top) / scale));
  setRect({ x, y, w: MIN, h: MIN });
  drag = { handle: 'se', startX: e.clientX, startY: e.clientY, start: { ...rect } };
  box.setPointerCapture(e.pointerId);
});

box.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 10 : 1;
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const m = moves[e.key];
  if (!m) return;
  e.preventDefault();
  setRect({ ...rect, x: rect.x + m[0], y: rect.y + m[1] });
});

/* ------------------------------------------------------------------ */
/* Option controls                                                     */
/* ------------------------------------------------------------------ */
aspectSelect.addEventListener('change', () => {
  if (srcW) setRect(fitRect(aspect()));
});
for (const el of document.querySelectorAll<HTMLInputElement>('input[name="shape"]')) {
  el.addEventListener('change', () => {
    if (el.value === 'circle' && aspectSelect.value === 'free') {
      aspectSelect.value = '1:1';
      if (srcW) setRect(fitRect(1));
    }
    layout();
  });
}
$('crop-reset').addEventListener('click', () => {
  if (srcW) setRect(fitRect(aspect()));
});
for (const [key, el] of Object.entries(fields) as [keyof typeof fields, HTMLInputElement][]) {
  el.addEventListener('change', () => {
    if (!srcW) return;
    const v = Number(el.value);
    if (!Number.isFinite(v)) return layout();
    const next = { ...rect, [key]: v };
    const a = aspect();
    if (a && key === 'w') next.h = Math.round(v / a);
    if (a && key === 'h') next.w = Math.round(v * a);
    if (next.x + next.w > srcW) next.w = srcW - next.x;
    if (next.y + next.h > srcH) next.h = srcH - next.y;
    if (a) {
      // Keep the ratio after clamping to the edges.
      if (next.w / next.h > a) next.w = Math.round(next.h * a);
      else next.h = Math.round(next.w / a);
    }
    setRect(next);
  });
}


export const cropBox = {
  show,
  hide,
  /** The crop rectangle in source pixels. */
  rect: (): Rect => ({ ...rect }),
  /** The picture's size in source pixels, or 0 when nothing is shown. */
  size: (): { width: number; height: number } => ({ width: srcW, height: srcH }),
};
