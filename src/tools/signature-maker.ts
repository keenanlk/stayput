import { bool, createShell, num, radio, str } from '../lib/shell';
import { downloadBlob } from '../lib/files';
import { trackToolRun } from '../lib/analytics';
import { canvasToBlob, decodeImage, drawScaled } from '../lib/image';
import { saveHandoff } from '../lib/handoff';
import { firstOutsideLatin, inkAlpha, inkShare, outputSize, strokePath, strokesToSvg, trimAlpha, trimRect, type Rect, type Stroke } from '../lib/signature';
import { InputError } from '../lib/input-error';

/**
 * Signature maker. A drawn signature is kept as points and painted from them,
 * a typed one is set in an embedded script font, and a photo has its paper
 * taken out by src/lib/signature.ts. Nothing is sent anywhere: the only
 * analytics are the existing tool_run counts, with a mode-and-output label.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const panel = $('sm-panel');
const pad = $<HTMLCanvasElement>('sm-pad');
const padCtx = pad.getContext('2d')!;
const frame = $('sm-frame');
const preview = $<HTMLCanvasElement>('sm-canvas');
const info = $('sm-info');
const status = $('sm-status');
const pngBtn = $<HTMLButtonElement>('sm-png');
const svgBtn = $<HTMLButtonElement>('sm-svg');
const copyBtn = $<HTMLButtonElement>('sm-copy');
const signBtn = $<HTMLButtonElement>('sm-signpdf');
const undoBtn = $<HTMLButtonElement>('sm-undo');
const clearBtn = $<HTMLButtonElement>('sm-clear');

// The shell supplies the privacy panel and next steps; files are never added here.
createShell({ process: async () => [] });

/** The three type styles: the family and weight the canvas must load, and the CSS fallback. */
const FONTS: Record<string, { family: string; weight: number; fallback: string }> = {
  caveat: { family: 'Caveat', weight: 500, fallback: '"Segoe Script", "Bradley Hand", cursive' },
  'great-vibes': { family: 'Great Vibes', weight: 400, fallback: '"Segoe Script", "Brush Script MT", cursive' },
  dancing: { family: 'Dancing Script', weight: 500, fallback: '"Segoe Script", "Brush Script MT", cursive' },
};
const TYPE_SIZE = 200;
const PREVIEW_WIDTH = 720;
const PHOTO_EDGE = 1600;

type Mode = 'draw' | 'type' | 'photo';
const mode = (): Mode => radio('sm-mode', 'draw') as Mode;
const ink = () => str('sm-ink', '#111111');
const chosenWidth = () => num('sm-out', 1200);

/** What can be painted at any width: its shape in the saved image, and how to draw it. */
interface Source {
  /** Width of the trimmed picture at its own scale; a photo is never saved wider than this. */
  naturalWidth: number;
  aspect: number;
  fromPhoto: boolean;
  paint(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
let strokes: Stroke[] = [];
let typed: { text: string; font: string; source: Source | undefined } | undefined;
let photo: { size: number; w: number; h: number; alpha: Uint8ClampedArray; rect: Rect; coloured: HTMLCanvasElement; colour: string } | undefined;
let pixels: { size: number; w: number; h: number; data: Uint8ClampedArray } | undefined;
let photoMessage: { text: string; warn: boolean } | undefined;
let firstOk = true;
let renderToken = 0;

/* ------------------------------------------------------------------ */
/* Draw                                                                */
/* ------------------------------------------------------------------ */
function paintPad() {
  padCtx.clearRect(0, 0, pad.width, pad.height);
  padCtx.lineCap = 'round';
  padCtx.lineJoin = 'round';
  padCtx.strokeStyle = ink();
  const smooth = bool('sm-smooth');
  for (const s of strokes) {
    padCtx.lineWidth = s.w;
    padCtx.stroke(new Path2D(strokePath(s, smooth)));
  }
}

function padPoint(e: PointerEvent): [number, number] {
  const r = pad.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * pad.width, ((e.clientY - r.top) / r.height) * pad.height];
}

let current: Stroke | undefined;
pad.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  pad.setPointerCapture(e.pointerId);
  current = { pts: [padPoint(e)], w: num('sm-width', 5) };
  strokes.push(current);
  changed();
});
pad.addEventListener('pointermove', (e) => {
  if (!current) return;
  const p = padPoint(e);
  const last = current.pts[current.pts.length - 1]!;
  if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return;
  current.pts.push(p);
  changed();
});
const lift = () => {
  current = undefined;
};
pad.addEventListener('pointerup', lift);
pad.addEventListener('pointercancel', lift);
pad.addEventListener('pointerleave', lift);

function undo() {
  if (!strokes.length) return;
  strokes.pop();
  changed();
}
undoBtn.addEventListener('click', undo);
clearBtn.addEventListener('click', () => {
  strokes = [];
  changed();
});
panel.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && mode() === 'draw' && !(e.target instanceof HTMLInputElement && e.target.type === 'text')) {
    e.preventDefault();
    undo();
  }
});

function drawSource(): Source | undefined {
  if (!strokes.length) return undefined;
  const r = trimRect(strokes);
  const smooth = bool('sm-smooth');
  const colour = ink();
  const paths = strokes.map((s) => ({ d: new Path2D(strokePath(s, smooth)), w: s.w }));
  return {
    naturalWidth: r.w,
    aspect: r.w / r.h,
    fromPhoto: false,
    paint(ctx, width) {
      const k = width / r.w;
      ctx.scale(k, k);
      ctx.translate(-r.x, -r.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = colour;
      for (const p of paths) {
        ctx.lineWidth = p.w;
        ctx.stroke(p.d);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Type                                                                */
/* ------------------------------------------------------------------ */
const nameText = () => str('sm-text').trim();
const fontKey = () => (radio('sm-font', 'caveat') in FONTS ? radio('sm-font', 'caveat') : 'caveat');

function syncTiles() {
  const name = str('sm-text').trim() || 'Your name';
  for (const el of document.querySelectorAll<HTMLElement>('.sm-tile-preview')) el.textContent = name;
}

async function typeSource(): Promise<Source | undefined> {
  const text = nameText();
  if (!text) return undefined;
  const key = fontKey();
  if (typed && typed.text === text && typed.font === key) return typed.source;
  const f = FONTS[key]!;
  const css = `${f.weight} ${TYPE_SIZE}px "${f.family}", ${f.fallback}`;
  try {
    await document.fonts.load(`${f.weight} ${TYPE_SIZE}px "${f.family}"`, text);
  } catch {
    /* the generic family is used */
  }
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = css;
  const m = probe.measureText(text);
  const left = m.actualBoundingBoxLeft;
  const right = m.actualBoundingBoxRight || m.width;
  const ascent = m.actualBoundingBoxAscent || TYPE_SIZE * 0.8;
  const descent = m.actualBoundingBoxDescent || TYPE_SIZE * 0.25;
  const margin = TYPE_SIZE * 0.12;
  const w = left + right + margin * 2;
  const h = ascent + descent + margin * 2;
  const colour = () => ink();
  const source: Source = {
    naturalWidth: w,
    aspect: w / h,
    fromPhoto: false,
    paint(ctx, width) {
      const k = width / w;
      ctx.scale(k, k);
      ctx.font = css;
      ctx.fillStyle = colour();
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, margin + left, margin + ascent);
    },
  };
  typed = { text, font: key, source };
  return source;
}

/* ------------------------------------------------------------------ */
/* Photo                                                               */
/* ------------------------------------------------------------------ */
function colourPhoto() {
  if (!photo) return;
  const colour = ink();
  const c = photo.coloured;
  const ctx = c.getContext('2d')!;
  const rgb = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  const out = ctx.createImageData(photo.w, photo.h);
  for (let i = 0; i < photo.alpha.length; i++) {
    out.data[i * 4] = rgb[0]!;
    out.data[i * 4 + 1] = rgb[1]!;
    out.data[i * 4 + 2] = rgb[2]!;
    out.data[i * 4 + 3] = photo.alpha[i]!;
  }
  ctx.putImageData(out, 0, 0);
  photo.colour = colour;
}

function photoSource(): Source | undefined {
  if (!photo || photo.rect.w === 0) return undefined;
  const p = photo;
  return {
    naturalWidth: p.rect.w,
    aspect: p.rect.w / p.rect.h,
    fromPhoto: true,
    paint(ctx, width, height) {
      if (p.colour !== ink()) colourPhoto();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(p.coloured, p.rect.x, p.rect.y, p.rect.w, p.rect.h, 0, 0, width, height);
    },
  };
}

/** Decode the chosen file once, to at most 1600 px on its long edge, on white so a transparent PNG reads as paper. */
async function loadPhoto(file: File) {
  const started = ++renderToken;
  photoMessage = undefined;
  photo = undefined;
  pixels = undefined;
  try {
    const { bitmap } = await decodeImage(file);
    const k = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * k));
    const h = Math.max(1, Math.round(bitmap.height * k));
    const scaled = drawScaled(bitmap, w, h, '#ffffff') as HTMLCanvasElement;
    bitmap.close();
    const data = scaled.getContext('2d')!.getImageData(0, 0, w, h).data;
    scaled.width = scaled.height = 0;
    if (started !== renderToken) return;
    pixels = { size: file.size, w, h, data };
    computePhoto();
  } catch {
    photoMessage = { text: 'This file is not an image this page can read. Try a JPG, PNG or WebP photo.', warn: true };
  }
  await render();
}

/** Work out the ink mask for the slider's strength, and say so when it holds no ink or almost only ink. */
function computePhoto() {
  if (!pixels) return;
  const { w, h, data, size } = pixels;
  const alpha = inkAlpha(data, w, h, num('sm-strength', 50));
  const { count, share } = inkShare(alpha);
  const rect = trimAlpha(alpha, w, h);
  photoMessage = undefined;
  photo = undefined;
  if (count < 20 || rect.w === 0) {
    photoMessage = { text: 'No ink found. Use dark ink on light paper, or raise Ink strength.', warn: true };
    return;
  }
  if (share > 0.4) {
    photoMessage = { text: 'Most of this photo looks like ink. Try plain light paper, or lower Ink strength.', warn: true };
    return;
  }
  const coloured = document.createElement('canvas');
  coloured.width = w;
  coloured.height = h;
  photo = { size, w, h, alpha, rect, coloured, colour: '' };
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */
async function source(): Promise<Source | undefined> {
  const m = mode();
  if (m === 'draw') return drawSource();
  if (m === 'type') return typeSource();
  return photoSource();
}

function sizeFor(src: Source, chosen: number) {
  const width = outputSize(src.naturalWidth, chosen, src.fromPhoto);
  return { width, height: Math.max(1, Math.round(width / src.aspect)) };
}

function paintTo(src: Source, canvas: HTMLCanvasElement, width: number) {
  const { height } = sizeFor(src, width);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  src.paint(ctx, width, height);
}

function say(text: string, warn = false) {
  info.textContent = text;
  info.classList.toggle('is-warn', warn);
}
function note(text: string, warn = false) {
  status.hidden = !text;
  status.textContent = text;
  status.classList.toggle('is-warn', warn);
}

let latest: Source | undefined;

async function render() {
  const token = ++renderToken;
  const m = mode();
  const src = await source();
  if (token !== renderToken) return;
  latest = src;
  undoBtn.disabled = clearBtn.disabled = strokes.length === 0;
  const ok = !!src;
  pngBtn.disabled = copyBtn.disabled = signBtn.disabled = !ok;
  svgBtn.disabled = !(ok && m === 'draw');
  svgBtn.title = m === 'draw' ? '' : 'SVG is available for drawn signatures.';
  copyBtn.hidden = !('ClipboardItem' in window) || !navigator.clipboard?.write;
  frame.dataset.state = ok ? 'ready' : 'empty';
  const empty = $('sm-empty');
  empty.textContent =
    m === 'type' ? 'Type your name to see it here on a transparent background.' : m === 'photo' ? 'Add a photo of your signature to see it here on a transparent background.' : 'Your signature will appear here on a transparent background.';

  if (m === 'draw') {
    paintPad();
  } else if (m === 'type') {
    const c = firstOutsideLatin(nameText());
    syncTiles();
    if (c) {
      say(`${c} is not in these script fonts and is drawn in a standard font. Names with accents such as é, ñ and ü are fine.`, true);
    } else if (src) {
      const s = sizeFor(src, chosenWidth());
      say(`Saved size: ${s.width} × ${s.height} px, transparent. This is a typeface, not your own handwriting.`);
    } else say('');
  }
  if (m === 'photo') {
    if (photoMessage) say(photoMessage.text, photoMessage.warn);
    else if (src) {
      const s = sizeFor(src, chosenWidth());
      say(`Paper removed. Saved size: ${s.width} × ${s.height} px, transparent. Crop away any printed lines first: anything dark is kept.`);
    } else say('');
  }
  if (m === 'draw') {
    if (src) {
      const s = sizeFor(src, chosenWidth());
      say(`Saved size: ${s.width} × ${s.height} px, transparent.`);
    } else say('');
  }
  if (src) paintTo(src, preview, PREVIEW_WIDTH);
}

let raf = 0;
function changed() {
  paintPad();
  undoBtn.disabled = clearBtn.disabled = strokes.length === 0;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => void render());
}

/* ------------------------------------------------------------------ */
/* Outputs                                                             */
/* ------------------------------------------------------------------ */
async function makePng(): Promise<Blob> {
  const src = latest;
  if (!src) throw new InputError('Nothing to save yet.');
  const c = document.createElement('canvas');
  paintTo(src, c, sizeFor(src, chosenWidth()).width);
  return canvasToBlob(c, 'image/png');
}

function done(blob: Blob, output: 'png' | 'svg' | 'copy' | 'signpdf', started: number) {
  const m = mode();
  trackToolRun({
    tool: root.dataset.slug ?? 'signature-maker',
    outcome: 'ok',
    firstOk,
    files: m === 'photo' ? 1 : 0,
    inputBytes: m === 'photo' ? (photo?.size ?? 0) : 0,
    outputBytes: blob.size,
    ms: performance.now() - started,
    format: `${m}-${output}`,
  });
  firstOk = false;
  root.dispatchEvent(new CustomEvent('stayput:done'));
}

pngBtn.addEventListener('click', async () => {
  const started = performance.now();
  try {
    const blob = await makePng();
    downloadBlob(blob, 'signature.png');
    done(blob, 'png', started);
  } catch {
    note('The browser could not save this image.', true);
  }
});

svgBtn.addEventListener('click', () => {
  if (mode() !== 'draw' || !strokes.length) return;
  const started = performance.now();
  const blob = new Blob([strokesToSvg(strokes, ink(), bool('sm-smooth'), chosenWidth())], { type: 'image/svg+xml' });
  downloadBlob(blob, 'signature.svg');
  done(blob, 'svg', started);
});

copyBtn.addEventListener('click', async () => {
  const started = performance.now();
  try {
    // The promise, not the awaited blob: Safari needs the write to start inside the click.
    const png = makePng();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    note('Copied. Paste it into your document.');
    done(await png, 'copy', started);
  } catch {
    note('Your browser did not allow copying. Use Download PNG instead.', true);
  }
});

signBtn.addEventListener('click', async () => {
  const started = performance.now();
  try {
    const blob = await makePng();
    const saved = await saveHandoff({ name: 'signature.png', blob }, '/tools/sign-pdf', 'Signature maker', 'signature');
    done(blob, 'signpdf', started);
    if (saved) {
      location.assign('/tools/sign-pdf');
    } else {
      note('Your browser would not carry the signature over. Download the PNG, then choose it in Sign PDF.', true);
    }
  } catch {
    note('The browser could not save this image.', true);
  }
});

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */
function syncMode() {
  const m = mode();
  panel.dataset.mode = m;
  $('sm-draw').hidden = m !== 'draw';
  $('sm-type').hidden = m !== 'type';
  $('sm-photo').hidden = m !== 'photo';
  note('');
  void render();
}
for (const el of document.querySelectorAll<HTMLInputElement>('input[name="sm-mode"]')) el.addEventListener('change', syncMode);

for (const id of ['sm-ink', 'sm-out', 'sm-width']) $(id).addEventListener('change', () => void render());
$('sm-smooth').addEventListener('change', () => void render());
$('sm-text').addEventListener('input', () => void render());
for (const el of document.querySelectorAll<HTMLInputElement>('input[name="sm-font"]')) el.addEventListener('change', () => void render());

// Photo: choose, drop, and the strength slider (recomputed on change, not on every tick).
const fileInput = $<HTMLInputElement>('sm-file');
$('sm-choose').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void loadPhoto(f);
  fileInput.value = '';
});
const drop = $('sm-photo-drop');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('is-over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('is-over');
  const f = e.dataTransfer?.files?.[0];
  if (f) void loadPhoto(f);
});
$('sm-strength').addEventListener('change', () => {
  if (!pixels) return;
  computePhoto();
  void render();
});

syncTiles();
void render();
