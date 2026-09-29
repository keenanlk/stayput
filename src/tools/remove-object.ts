import { createShell, bindRange, num, str } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { inpaint } from '../lib/inpaint';

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
/** Earlier versions kept for Undo; each is a full-size copy, so only a few. */
const HISTORY = 8;
const STROKE_COLOUR = '#ff2d55';

type Stroke = { r: number; pts: [number, number][] };

/** The picture as it stands after every erase so far, at full size. */
let work: HTMLCanvasElement | undefined;
let history: HTMLCanvasElement[] = [];
let strokes: Stroke[] = [];
let painting: Stroke | undefined;
let busy = false;
let srcW = 0;
let srcH = 0;
let previewScale = 1;
let notice: string | undefined;

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
  hint.textContent = notice
    ?? (hasStrokes
      ? 'Press Erase to fill in the painted area, or keep painting.'
      : history.length > 0
        ? `${history.length} ${history.length === 1 ? 'area' : 'areas'} erased. Paint over anything else, or save the picture.`
        : 'Paint over the thing to remove, then press Erase.');
  panel.dataset.edits = String(history.length);
  panel.dataset.strokes = String(strokes.length);
  panel.dataset.busy = String(busy);
}

async function showImage(file: File) {
  const decoded = await decodeImage(file);
  srcW = decoded.width;
  srcH = decoded.height;
  work = document.createElement('canvas');
  work.width = srcW;
  work.height = srcH;
  work.getContext('2d')!.drawImage(decoded.bitmap, 0, 0);
  decoded.bitmap.close();
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
/** One byte per source pixel, non-zero under the paint, and the painted bounding box. */
function holeMask(): { hole: Uint8Array; count: number } {
  const m = document.createElement('canvas');
  m.width = srcW;
  m.height = srcH;
  const ctx = m.getContext('2d', { willReadFrequently: true })!;
  drawStrokes(ctx, 1, strokes, '#fff');
  const data = ctx.getImageData(0, 0, srcW, srcH).data;
  const hole = new Uint8Array(srcW * srcH);
  let count = 0;
  for (let i = 0; i < hole.length; i++) {
    if (data[i * 4 + 3]! > 0) {
      hole[i] = 1;
      count++;
    }
  }
  return { hole, count };
}

async function erase(onStatus: (text: string) => void = () => {}) {
  if (!work || strokes.length === 0 || busy) return;
  busy = true;
  notice = undefined;
  sync();
  try {
    const { hole, count } = holeMask();
    if (count === 0) return;
    const ctx = work.getContext('2d', { willReadFrequently: true })!;
    const rgba = ctx.getImageData(0, 0, srcW, srcH).data;
    const filled = await inpaint(rgba, hole, srcW, srcH, {
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
    const before = document.createElement('canvas');
    before.width = srcW;
    before.height = srcH;
    before.getContext('2d')!.drawImage(work, 0, 0);
    history.push(before);
    if (history.length > HISTORY) history.shift();
    ctx.putImageData(new ImageData(filled, srcW, srcH), 0, 0);
    strokes = [];
    notice = undefined;
  } catch (e) {
    notice = `Could not erase: ${e instanceof Error ? e.message : String(e)}`;
    throw e;
  } finally {
    busy = false;
    redraw();
  }
}

goBtn.addEventListener('click', () => void erase().catch(() => {}));
undoBtn.addEventListener('click', () => {
  if (busy) return;
  notice = undefined;
  if (strokes.length > 0) strokes.pop();
  else if (work && history.length > 0) {
    const prev = history.pop()!;
    work.getContext('2d')!.drawImage(prev, 0, 0);
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
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (!work) await showImage(entry.file);
    if (strokes.length > 0) {
      progress.set('Erasing…', 0.1);
      await erase((text) => progress.set(text, 0.3));
    }
    if (history.length === 0) throw new Error('Paint over the thing to remove first, then press Erase or Save.');
    const type = outputType(entry.file, str('format', 'keep'));
    const quality = num('quality', 92) / 100;
    progress.set('Saving…', 0.85);
    let out: HTMLCanvasElement = work!;
    if (type === 'image/jpeg') {
      // JPG has no transparency, so transparent pixels become white rather than black.
      out = document.createElement('canvas');
      out.width = srcW;
      out.height = srcH;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, srcW, srcH);
      ctx.drawImage(work!, 0, 0);
    }
    const blob = await canvasToBlob(out, type, type === 'image/png' ? undefined : quality);
    if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
    const preview = await createImageBitmap(out);
    const outs: OutputFile[] = [
      {
        name: suffixName(entry.file.name, '-erased', extForType(type)),
        blob,
        originalSize: entry.file.size,
        previewUrl: await thumbnail(preview),
        note: `${history.length} ${history.length === 1 ? 'area' : 'areas'} erased`,
      },
    ];
    preview.close();
    progress.set('Done', 1);
    return outs;
  },
});
