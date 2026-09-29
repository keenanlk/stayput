import { createShell, bindRange, num, str, radio } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { apply, effectSize, firstGrapheme, type Effect, type Rect } from '../lib/blur';
import { findFaces } from '../lib/faces';

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('blur-panel');
const stage = $('blur-stage');
const canvas = $<HTMLCanvasElement>('blur-canvas');
const layer = $('blur-areas');
const hint = $('blur-hint');
const undoBtn = $<HTMLButtonElement>('blur-undo');
const clearBtn = $<HTMLButtonElement>('blur-clear');
const findBtn = $<HTMLButtonElement>('blur-find');
const strengthField = $('strength-field');
const emojiField = $('emoji-field');
const emojiInput = $<HTMLInputElement>('emoji');

bindRange('quality', 'quality-out');
bindRange('strength', 'strength-out');

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
/** Smallest area worth keeping, in source pixels; anything smaller was a tap. */
const MIN = 4;
/** The preview is drawn at most this many pixels on its longer side. */
const PREVIEW_MAX = 1600;
let bitmap: ImageBitmap | undefined;
let srcW = 0;
let srcH = 0;
/** Preview pixels per source pixel. */
let previewScale = 1;
/** Areas to hide, in source pixels, in the order they were drawn. */
let areas: Rect[] = [];
let drawing: { x0: number; y0: number; rect: Rect } | undefined;
/** A message from the face finder that replaces the usual hint until the areas change. */
let notice: string | undefined;

const effect = () => radio('effect', 'blur') as Effect;
const whole = () => radio('area', 'areas') === 'whole';
/** The emoji to cover each area with: the first one typed or pasted, or a smiley. */
const emojiChar = () => firstGrapheme(emojiInput.value) || '🙂';

/** Where every area and the drawing box go on screen, in displayed pixels. */
function displayScale(): number {
  return srcW ? canvas.clientWidth / srcW : 1;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */
function targets(): Rect[] {
  if (whole()) return [{ x: 0, y: 0, w: srcW, h: srcH }];
  return drawing ? [...areas, drawing.rect] : areas;
}

/** Draw the image with the effect applied to the given areas, at `scale` pixels per source pixel. */
function render(ctx: CanvasRenderingContext2D, scale: number, rects: Rect[], background?: string) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap!, 0, 0, w, h);
  const size = effectSize(num('strength', 5), srcW, srcH) * scale;
  const e = effect();
  const char = emojiChar();
  for (const r of rects) apply(ctx, e, { x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale }, size, char);
}

let frame = 0;
/** Redraw the preview on the next animation frame (slider drags fire many events). */
function redraw() {
  if (!bitmap || frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!bitmap) return;
    render(canvas.getContext('2d', { willReadFrequently: true })!, previewScale, targets());
    layout();
  });
}

/** Position the area outlines and sync the buttons and hint. */
function layout() {
  const s = displayScale();
  const isWhole = whole();
  stage.classList.toggle('is-whole', isWhole);
  layer.replaceChildren();
  if (!isWhole) {
    areas.forEach((r, i) => {
      const el = document.createElement('div');
      el.className = 'blur-area';
      Object.assign(el.style, { left: `${r.x * s}px`, top: `${r.y * s}px`, width: `${r.w * s}px`, height: `${r.h * s}px` });
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', `Remove area ${i + 1}`);
      del.addEventListener('click', () => {
        areas.splice(i, 1);
        notice = undefined;
        redraw();
      });
      el.append(del);
      layer.append(el);
    });
    if (drawing) {
      const r = drawing.rect;
      const el = document.createElement('div');
      el.className = 'blur-area is-drawing';
      Object.assign(el.style, { left: `${r.x * s}px`, top: `${r.y * s}px`, width: `${r.w * s}px`, height: `${r.h * s}px` });
      layer.append(el);
    }
  }
  undoBtn.disabled = clearBtn.disabled = isWhole || areas.length === 0;
  findBtn.hidden = isWhole;
  hint.textContent = notice && !isWhole
    ? notice
    : isWhole
    ? 'The whole image gets the effect. Switch to "Areas I mark" to hide only parts of it.'
    : areas.length === 0
      ? 'Drag across each face, plate or line of text to hide it.'
      : `${areas.length} ${areas.length === 1 ? 'area' : 'areas'} marked. Drag to add another, or tap × to remove one.`;
  strengthField.hidden = effect() === 'box';
  emojiField.hidden = effect() !== 'emoji';
  for (const b of document.querySelectorAll<HTMLButtonElement>('.emoji-pick')) b.setAttribute('aria-pressed', String(b.dataset.emoji === emojiChar()));
  panel.dataset.areas = areas.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(';');
}

async function showImage(file: File) {
  bitmap?.close();
  bitmap = undefined;
  const decoded = await decodeImage(file);
  bitmap = decoded.bitmap;
  srcW = decoded.width;
  srcH = decoded.height;
  previewScale = Math.min(1, PREVIEW_MAX / srcW, PREVIEW_MAX / srcH);
  canvas.width = Math.max(1, Math.round(srcW * previewScale));
  canvas.height = Math.max(1, Math.round(srcH * previewScale));
  areas = [];
  drawing = undefined;
  notice = undefined;
  delete panel.dataset.faces;
  panel.hidden = false;
  redraw();
  if (autoFind && !whole()) void runFindFaces();
}

function hideImage() {
  bitmap?.close();
  bitmap = undefined;
  srcW = srcH = 0;
  areas = [];
  panel.hidden = true;
}

new ResizeObserver(() => {
  if (!panel.hidden) layout();
}).observe(stage);

/* ------------------------------------------------------------------ */
/* Drawing areas                                                       */
/* ------------------------------------------------------------------ */
function toSource(e: PointerEvent): [number, number] {
  const b = canvas.getBoundingClientRect();
  const s = displayScale();
  return [Math.min(srcW, Math.max(0, (e.clientX - b.left) / s)), Math.min(srcH, Math.max(0, (e.clientY - b.top) / s))];
}

stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !srcW || whole() || (e.target as HTMLElement).closest('button')) return;
  e.preventDefault();
  const [x, y] = toSource(e);
  drawing = { x0: x, y0: y, rect: { x: Math.round(x), y: Math.round(y), w: 0, h: 0 } };
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const [x, y] = toSource(e);
  const x0 = Math.round(Math.min(x, drawing.x0));
  const y0 = Math.round(Math.min(y, drawing.y0));
  drawing.rect = { x: x0, y: y0, w: Math.round(Math.max(x, drawing.x0)) - x0, h: Math.round(Math.max(y, drawing.y0)) - y0 };
  redraw();
});
const endDraw = () => {
  if (!drawing) return;
  const r = drawing.rect;
  drawing = undefined;
  if (r.w >= MIN && r.h >= MIN) {
    areas.push(r);
    notice = undefined;
  }
  redraw();
};
stage.addEventListener('pointerup', endDraw);
stage.addEventListener('pointercancel', endDraw);

/** On the blur-face landing page the job is faces, so the search starts as soon as a photo is in. */
const autoFind = document.getElementById('tool')?.dataset.slug === 'blur-face';
const findLabel = findBtn.textContent;

async function runFindFaces() {
  if (!bitmap || findBtn.disabled) return;
  const source = bitmap;
  findBtn.disabled = true;
  findBtn.textContent = 'Finding faces…';
  panel.dataset.finding = 'true';
  try {
    const faces = await findFaces(source, (stage) => {
      notice = stage === 'loading' ? 'Loading the face finder (about 4 MB, first time only)…' : 'Looking for faces…';
      layout();
    });
    if (source !== bitmap) return; // A different image was dropped meanwhile.
    // Skip faces already covered by an area the person drew.
    const fresh = faces.filter((f) => !areas.some((a) => a.x <= f.x + f.w / 2 && f.x + f.w / 2 <= a.x + a.w && a.y <= f.y + f.h / 2 && f.y + f.h / 2 <= a.y + a.h));
    areas.push(...fresh);
    notice = faces.length === 0
      ? 'No faces found. Drag across any face to hide it yourself.'
      : `Found ${faces.length} ${faces.length === 1 ? 'face' : 'faces'}. Check the preview: drag across any it missed, tap × on anything that is not a face.`;
    panel.dataset.faces = String(faces.length);
  } catch (e) {
    notice = `The face finder could not start (${e instanceof Error ? e.message : String(e)}). Drag across each face instead.`;
  } finally {
    findBtn.disabled = false;
    findBtn.textContent = findLabel;
    delete panel.dataset.finding;
    redraw();
  }
  // Another photo was dropped while this one was being searched: search that one too.
  if (autoFind && bitmap && bitmap !== source && !whole()) void runFindFaces();
}
findBtn.addEventListener('click', () => void runFindFaces());
undoBtn.addEventListener('click', () => {
  areas.pop();
  notice = undefined;
  redraw();
});
clearBtn.addEventListener('click', () => {
  areas = [];
  notice = undefined;
  redraw();
});
for (const el of document.querySelectorAll<HTMLInputElement>('input[name="area"], input[name="effect"]')) el.addEventListener('change', redraw);
$('strength').addEventListener('input', redraw);
emojiInput.addEventListener('input', redraw);
// Keep only the first emoji once the field loses focus, so what is shown is what gets drawn.
emojiInput.addEventListener('change', () => {
  emojiInput.value = emojiChar();
  redraw();
});
for (const b of document.querySelectorAll<HTMLButtonElement>('.emoji-pick')) {
  b.addEventListener('click', () => {
    emojiInput.value = b.dataset.emoji ?? '🙂';
    redraw();
  });
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
function outputType(file: File, choice: string): EncodeType {
  if (choice !== 'keep') return choice as EncodeType;
  if (file.type === 'image/png') return 'image/png';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

const suffix: Record<Effect, string> = { blur: '-blurred', pixelate: '-pixelated', box: '-redacted', emoji: '-emoji' };

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
  outputFormat: () => effect(),
  async process(files, progress) {
    const entry = files[0]!;
    if (!bitmap || !srcW) await showImage(entry.file);
    if (!whole() && areas.length === 0) {
      throw new Error('Mark at least one area first: drag across the part of the image to hide, or choose "Whole image".');
    }
    const type = outputType(entry.file, str('format', 'keep'));
    const quality = num('quality', 92) / 100;
    progress.set(effect() === 'box' || effect() === 'emoji' ? 'Covering…' : effect() === 'pixelate' ? 'Pixelating…' : 'Blurring…', 0.3);
    const out = document.createElement('canvas');
    out.width = srcW;
    out.height = srcH;
    const ctx = out.getContext('2d', { willReadFrequently: true })!;
    // JPG has no transparency, so transparent pixels become white rather than black.
    render(ctx, 1, whole() ? [{ x: 0, y: 0, w: srcW, h: srcH }] : areas, type === 'image/jpeg' ? '#ffffff' : undefined);
    progress.set('Saving…', 0.8);
    const blob = await canvasToBlob(out, type, type === 'image/png' ? undefined : quality);
    if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
    const preview = await createImageBitmap(out);
    const n = whole() ? 'whole image' : `${areas.length} ${areas.length === 1 ? 'area' : 'areas'}`;
    const outs: OutputFile[] = [
      {
        name: suffixName(entry.file.name, suffix[effect()], extForType(type)),
        blob,
        originalSize: entry.file.size,
        previewUrl: await thumbnail(preview),
        note: `${effect() === 'box' ? 'black box' : effect() === 'emoji' ? `emoji ${emojiChar()}` : effect()}, ${n}`,
      },
    ];
    preview.close();
    progress.set('Done', 1);
    return outs;
  },
});
