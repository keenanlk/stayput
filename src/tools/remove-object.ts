import { createShell, bindRange, num, str } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { inpaint } from '../lib/inpaint';
import { InputError, NamedError } from '../lib/input-error';
import { isBare, nameBare } from '../lib/bare-error';
import { canvasWorks, fitCanvas } from '../lib/canvas-cap';

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('erase-panel');
const stage = $('erase-stage');
const canvas = $<HTMLCanvasElement>('erase-canvas');
const strokesCanvas = $<HTMLCanvasElement>('erase-strokes');
const brushRing = $('erase-brush');
const hint = $('erase-hint');
const goBtn = $<HTMLButtonElement>('erase-go');
const undoBtn = $<HTMLButtonElement>('erase-undo');
const clearBtn = $<HTMLButtonElement>('erase-clear');

bindRange('quality', 'quality-out');
bindRange('brush', 'brush-out');

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
/** The preview is drawn at most this many pixels on its longer side. */
const PREVIEW_MAX = 1600;
/** Earlier versions kept for Undo: only the region each erase changed, so a few dozen small ones fit. */
const HISTORY = 20;
/** Bytes of Undo kept at most (the newest is always kept, however big). A wide brush on a big photo makes a big region. */
const HISTORY_BYTES = 160_000_000;
/** An erase never reaches further than this beyond the paint, or 0.75 of the painted box's longer side if that is more (pixels). */
const CONTEXT_MIN = 128;
const STROKE_COLOUR = '#ff2d55';

type Stroke = { r: number; pts: [number, number][] };

/** What an erase replaced: its place in the picture and the pixels from before. */
type Undo = { x: number; y: number; data: ImageData };
type Region = { x: number; y: number; w: number; h: number };

/** The picture as it stands after every erase so far, at the size this browser can draw (srcW × srcH). */
let work: HTMLCanvasElement | undefined;
let history: Undo[] = [];
let strokes: Stroke[] = [];
let painting: Stroke | undefined;
let busy = false;
let srcW = 0;
let srcH = 0;
let previewScale = 1;
let notice: string | undefined;
/** Said when the picture had to be drawn smaller than it is; shown in the hint and the result note. */
let sizeNote = '';

/** Displayed pixels per source pixel. */
const displayScale = () => (srcW ? canvas.clientWidth / srcW : 1);
/** Brush radius in source pixels: the slider is the diameter on screen. */
const brushRadius = () => num('brush', 40) / 2 / displayScale();

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */
function drawStrokes(ctx: CanvasRenderingContext2D, scale: number, list: Stroke[], colour: string) {
  ctx.strokeStyle = ctx.fillStyle = colour;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const s of list) {
    const [x0, y0] = s.pts[0]!;
    if (s.pts.length === 1) {
      ctx.beginPath();
      ctx.arc(x0 * scale, y0 * scale, s.r * scale, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.lineWidth = s.r * 2 * scale;
    ctx.beginPath();
    ctx.moveTo(x0 * scale, y0 * scale);
    for (const [x, y] of s.pts.slice(1)) ctx.lineTo(x * scale, y * scale);
    ctx.stroke();
  }
}

function allStrokes(): Stroke[] {
  return painting ? [...strokes, painting] : strokes;
}

let frame = 0;
function redraw() {
  if (!work || frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!work) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(work, 0, 0, canvas.width, canvas.height);
    const sctx = strokesCanvas.getContext('2d')!;
    sctx.clearRect(0, 0, strokesCanvas.width, strokesCanvas.height);
    drawStrokes(sctx, previewScale, allStrokes(), STROKE_COLOUR);
    sync();
  });
}

function sync() {
  const hasStrokes = strokes.length > 0;
  goBtn.disabled = busy || !hasStrokes;
  clearBtn.disabled = busy || !hasStrokes;
  undoBtn.disabled = busy || (!hasStrokes && history.length === 0);
  stage.classList.toggle('is-busy', busy);
  const base = notice
    ?? (hasStrokes
      ? 'Press Erase to fill in the painted area, or keep painting.'
      : history.length > 0
        ? `${history.length} ${history.length === 1 ? 'area' : 'areas'} erased. Paint over anything else, or save the picture.`
        : 'Paint over the thing to remove, then press Erase.');
  hint.textContent = sizeNote && !notice ? `${base} ${sizeNote}` : base;
  panel.dataset.edits = String(history.length);
  panel.dataset.strokes = String(strokes.length);
  panel.dataset.busy = String(busy);
}

async function showImage(file: File) {
  const decoded = await decodeImage(file);
  try {
    // A picture bigger than this browser can draw is edited at the largest size that works.
    const fit = canvasWorks(decoded.width, decoded.height) ? { width: decoded.width, height: decoded.height } : fitCanvas(decoded.width, decoded.height);
    if (!fit) throw new NamedError('CanvasTooLarge', 'This picture is too large for this browser to edit. Try a smaller copy of it, or use a computer.');
    const next = document.createElement('canvas');
    next.width = fit.width;
    next.height = fit.height;
    const wctx = next.getContext('2d', { willReadFrequently: true });
    if (!wctx) throw new NamedError('CanvasTooLarge', 'This picture is too large for this browser to edit. Try a smaller copy of it, or use a computer.');
    wctx.drawImage(decoded.bitmap, 0, 0, fit.width, fit.height);
    work = next;
    srcW = fit.width;
    srcH = fit.height;
    sizeNote = fit.width === decoded.width && fit.height === decoded.height ? '' : `Edited at ${fit.width} × ${fit.height}, the largest picture this browser can draw.`;
  } finally {
    decoded.bitmap.close();
  }
  previewScale = Math.min(1, PREVIEW_MAX / srcW, PREVIEW_MAX / srcH);
  canvas.width = strokesCanvas.width = Math.max(1, Math.round(srcW * previewScale));
  canvas.height = strokesCanvas.height = Math.max(1, Math.round(srcH * previewScale));
  history = [];
  strokes = [];
  painting = undefined;
  notice = undefined;
  panel.hidden = false;
  redraw();
}

function hideImage() {
  work = undefined;
  history = [];
  strokes = [];
  sizeNote = '';
  srcW = srcH = 0;
  panel.hidden = true;
}

/* ------------------------------------------------------------------ */
/* Painting                                                            */
/* ------------------------------------------------------------------ */
function toSource(e: PointerEvent): [number, number] {
  const b = canvas.getBoundingClientRect();
  const s = displayScale();
  return [Math.min(srcW, Math.max(0, (e.clientX - b.left) / s)), Math.min(srcH, Math.max(0, (e.clientY - b.top) / s))];
}

function moveRing(e: PointerEvent) {
  const b = stage.getBoundingClientRect();
  const d = num('brush', 40);
  Object.assign(brushRing.style, { left: `${e.clientX - b.left}px`, top: `${e.clientY - b.top}px`, width: `${d}px`, height: `${d}px` });
  brushRing.hidden = e.pointerType === 'touch';
}

stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !srcW || busy) return;
  e.preventDefault();
  painting = { r: brushRadius(), pts: [toSource(e)] };
  notice = undefined;
  stage.setPointerCapture(e.pointerId);
  redraw();
});
stage.addEventListener('pointermove', (e) => {
  moveRing(e);
  if (!painting) return;
  painting.pts.push(toSource(e));
  redraw();
});
const endPaint = () => {
  if (!painting) return;
  strokes.push(painting);
  painting = undefined;
  redraw();
};
stage.addEventListener('pointerup', endPaint);
stage.addEventListener('pointercancel', endPaint);
stage.addEventListener('pointerleave', () => (brushRing.hidden = true));

/* ------------------------------------------------------------------ */
/* Erasing                                                             */
/* ------------------------------------------------------------------ */
/**
 * The part of the picture an erase works on: the painted bounding box (each point plus the brush radius), grown on every
 * side by max(128, 0.75 × its longer side) so the model sees what lies around the paint, and kept inside the picture.
 */
function paintedRegion(): Region {
  if ((window as unknown as { __inpaintFull?: boolean }).__inpaintFull) return { x: 0, y: 0, w: srcW, h: srcH };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes) {
    for (const [x, y] of s.pts) {
      x0 = Math.min(x0, x - s.r);
      y0 = Math.min(y0, y - s.r);
      x1 = Math.max(x1, x + s.r);
      y1 = Math.max(y1, y + s.r);
    }
  }
  const grow = Math.max(CONTEXT_MIN, 0.75 * Math.max(x1 - x0, y1 - y0));
  const left = Math.max(0, Math.floor(x0 - grow));
  const top = Math.max(0, Math.floor(y0 - grow));
  const right = Math.min(srcW, Math.ceil(x1 + grow));
  const bottom = Math.min(srcH, Math.ceil(y1 + grow));
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}

/** One byte per pixel of the region, non-zero under the paint. */
function holeMask(r: Region): { hole: Uint8Array; count: number } {
  const m = document.createElement('canvas');
  m.width = r.w;
  m.height = r.h;
  const ctx = m.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new NamedError('CanvasTooLarge', 'This browser could not set aside enough memory to erase here. Close other tabs and try again, or paint a smaller area.');
  ctx.translate(-r.x, -r.y);
  drawStrokes(ctx, 1, strokes, '#fff');
  const data = ctx.getImageData(0, 0, r.w, r.h).data;
  const hole = new Uint8Array(r.w * r.h);
  let count = 0;
  for (let i = 0; i < hole.length; i++) {
    if (data[i * 4 + 3]! > 0) {
      hole[i] = 1;
      count++;
    }
  }
  m.width = m.height = 0;
  return { hole, count };
}

/** Plain words for a failure that has none: a browser that ran out of memory, or an error with no name of its own. */
function plainError(e: unknown): Error {
  if (!isBare(e)) return e as Error;
  const text = e instanceof Error ? e.message : String(e);
  if (/memory|allocat/i.test(text)) {
    return new NamedError('OutOfMemoryError', 'This device ran out of memory while erasing. Close other tabs and apps and try again, paint a smaller area, or use a computer.', { cause: e });
  }
  return nameBare('EraseFailed', e);
}

/** Keep the newest versions for Undo while they fit the count and byte limits. */
function trimHistory() {
  let bytes = history.reduce((n, u) => n + u.data.data.byteLength, 0);
  while (history.length > 1 && (history.length > HISTORY || bytes > HISTORY_BYTES)) bytes -= history.shift()!.data.data.byteLength;
}

async function erase(onStatus: (text: string) => void = () => {}) {
  if (!work || strokes.length === 0 || busy) return;
  busy = true;
  notice = undefined;
  sync();
  try {
    const region = paintedRegion();
    const { hole, count } = holeMask(region);
    if (count === 0) return;
    const ctx = work.getContext('2d', { willReadFrequently: true })!;
    const before = ctx.getImageData(region.x, region.y, region.w, region.h);
    const filled = await inpaint(before.data, hole, region.w, region.h, {
      onLoading: (f) => {
        notice = `Downloading the object removal model (28 MB, first time only): ${Math.round(f * 100)}%`;
        onStatus(notice);
        sync();
      },
      onWorking: () => {
        notice = 'Filling in the painted area…';
        onStatus(notice);
        sync();
      },
    });
    ctx.putImageData(new ImageData(filled, region.w, region.h), region.x, region.y);
    history.push({ x: region.x, y: region.y, data: before });
    trimHistory();
    strokes = [];
    notice = undefined;
  } catch (e) {
    const named = plainError(e);
    notice = `Could not erase: ${named.message}`;
    throw named;
  } finally {
    busy = false;
    redraw();
  }
}

// An Erase failure is shown as the notice and recorded as a failed run under its own class; a successful Erase sends nothing.
goBtn.addEventListener('click', () => {
  const done = shell.inflight('run');
  void erase()
    .catch((e) => shell.recordError(e))
    .finally(done);
});
undoBtn.addEventListener('click', () => {
  if (busy) return;
  notice = undefined;
  if (strokes.length > 0) strokes.pop();
  else if (work && history.length > 0) {
    const prev = history.pop()!;
    work.getContext('2d')!.putImageData(prev.data, prev.x, prev.y);
  }
  redraw();
});
clearBtn.addEventListener('click', () => {
  strokes = [];
  notice = undefined;
  redraw();
});
$('brush').addEventListener('input', () => {
  brushRing.style.width = brushRing.style.height = `${num('brush', 40)}px`;
});
new ResizeObserver(() => {
  if (!panel.hidden) sync();
}).observe(stage);

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
function outputType(file: File, choice: string): EncodeType {
  if (choice !== 'keep') return choice as EncodeType;
  if (file.type === 'image/png') return 'image/png';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

const shell = createShell({
  async onFilesChanged(files) {
    if (files.length === 0) return hideImage();
    try {
      await showImage(files[0]!.file);
    } catch (e) {
      hideImage();
      shell.previewFailed(e);
    }
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (!work) await showImage(entry.file);
    if (strokes.length > 0) {
      progress.set('Erasing…', 0.1);
      await erase((text) => progress.set(text, 0.3));
    }
    if (history.length === 0) throw new InputError('Paint over the thing to remove first, then press Erase or Save.');
    const type = outputType(entry.file, str('format', 'keep'));
    const quality = num('quality', 92) / 100;
    progress.set('Saving…', 0.85);
    let out: HTMLCanvasElement = work!;
    if (type === 'image/jpeg') {
      // JPG has no transparency, so transparent pixels become white rather than black.
      out = document.createElement('canvas');
      out.width = srcW;
      out.height = srcH;
      const ctx = out.getContext('2d');
      if (!ctx) throw new NamedError('CanvasTooLarge', 'This picture is too large for this browser to save as JPG. Save it as PNG, or use a smaller copy.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, srcW, srcH);
      ctx.drawImage(work!, 0, 0);
    }
    const blob = await canvasToBlob(out, type, type === 'image/png' ? undefined : quality);
    if (blob.type !== type) throw new NamedError('ImageEncodeUnsupported', `This browser cannot save ${extForType(type).toUpperCase()} images.`);
    const preview = await createImageBitmap(out);
    const outs: OutputFile[] = [
      {
        name: suffixName(entry.file.name, '-erased', extForType(type)),
        blob,
        originalSize: entry.file.size,
        previewUrl: await thumbnail(preview),
        note: `${history.length} ${history.length === 1 ? 'area' : 'areas'} erased${sizeNote ? `. ${sizeNote}` : ''}`,
      },
    ];
    preview.close();
    progress.set('Done', 1);
    return outs;
  },
});
