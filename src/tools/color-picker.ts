import { createShell, num } from '../lib/shell';
import { canvasToBlob, decodeImage, thumbnail } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { palette, textOn, toHex, toHslString, toRgbString, type RGB, type Swatch } from '../lib/color';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('color-panel');
const canvas = $<HTMLCanvasElement>('color-canvas');
const loupe = $('color-loupe');
const loupeCanvas = $<HTMLCanvasElement>('color-loupe-canvas');
const card = $('color-card');
const stateEl = $('color-state');
const picksEl = $<HTMLOListElement>('color-picks');
const picksEmpty = $('color-picks-empty');
const strip = $<HTMLOListElement>('color-strip');

/** The image at up to this size is kept for sampling; big enough that one screen pixel is never more than a few. */
const SAMPLE_MAX = 4096;
const LOUPE_PIXELS = 11;

let source: HTMLCanvasElement | undefined;
let sourceCtx: CanvasRenderingContext2D | undefined;
let sourceName = '';
let picked: RGB | undefined;
let picks: RGB[] = [];
let main: Swatch[] = [];
/** Keyboard cursor, in source pixels. */
let cursor = { x: 0, y: 0 };

function colorAt(x: number, y: number): RGB {
  const d = sourceCtx!.getImageData(x, y, 1, 1).data;
  // Transparent pixels show as the checkerboard; report the colour underneath as white.
  const a = d[3]! / 255;
  return [Math.round(d[0]! * a + 255 * (1 - a)), Math.round(d[1]! * a + 255 * (1 - a)), Math.round(d[2]! * a + 255 * (1 - a))];
}

function show(rgb: RGB, state: string) {
  const hex = toHex(rgb);
  card.style.setProperty('--swatch', hex);
  card.style.setProperty('--on', textOn(rgb));
  $('color-hex').textContent = hex;
  $('val-hex').textContent = hex;
  $('val-rgb').textContent = toRgbString(rgb);
  $('val-hsl').textContent = toHslString(rgb);
  stateEl.textContent = state;
}

function showPicked() {
  if (picked) show(picked, 'Picked. Copy it below, or pick another.');
  else stateEl.textContent = 'Move over the image, then click or tap to pick.';
}

async function copy(text: string, button: HTMLElement) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Select and copy';
  }
  setTimeout(() => (button.textContent = label), 1500);
}

function swatchButton(rgb: RGB, extra?: string): HTMLButtonElement {
  const hex = toHex(rgb);
  const b = document.createElement('button');
  b.type = 'button';
  b.title = `Copy ${hex}`;
  b.dataset.hex = hex;
  b.addEventListener('click', () => {
    picked = rgb;
    showPicked();
    void copy(hex, b.querySelector('b') ?? b);
  });
  b.innerHTML = extra ?? '';
  return b;
}

function renderPicks() {
  picksEl.innerHTML = '';
  picksEmpty.hidden = picks.length > 0;
  for (const rgb of picks) {
    const li = document.createElement('li');
    const b = swatchButton(rgb);
    const dot = document.createElement('i');
    dot.style.background = toHex(rgb);
    const label = document.createElement('b');
    label.style.fontWeight = '600';
    label.textContent = toHex(rgb);
    b.append(dot, label);
    li.append(b);
    picksEl.append(li);
  }
  panel.dataset.picks = picks.map(toHex).join(',');
}

function renderStrip() {
  strip.innerHTML = '';
  for (const s of main) {
    const li = document.createElement('li');
    li.style.flex = `${Math.max(s.share, 0.04)} 1 0`;
    const b = swatchButton(s.rgb);
    b.style.background = toHex(s.rgb);
    b.style.color = textOn(s.rgb);
    const hex = document.createElement('b');
    hex.textContent = toHex(s.rgb);
    const pct = document.createElement('span');
    pct.textContent = `${Math.max(1, Math.round(s.share * 100))}%`;
    b.append(hex, pct);
    li.append(b);
    strip.append(li);
  }
  panel.dataset.palette = main.map((s) => toHex(s.rgb)).join(',');
}

function computePalette() {
  if (!sourceCtx || !source) return;
  // The palette is taken from a copy of at most 400 px: plenty for colour counts, and instant.
  const s = Math.min(1, 400 / Math.max(source.width, source.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(source.width * s));
  c.height = Math.max(1, Math.round(source.height * s));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  main = palette(ctx.getImageData(0, 0, c.width, c.height).data, num('colors', 6));
  renderStrip();
}

async function showImage(file: File) {
  const decoded = await decodeImage(file);
  const s = Math.min(1, SAMPLE_MAX / Math.max(decoded.width, decoded.height));
  source = document.createElement('canvas');
  source.width = Math.max(1, Math.round(decoded.width * s));
  source.height = Math.max(1, Math.round(decoded.height * s));
  sourceCtx = source.getContext('2d', { willReadFrequently: true })!;
  sourceCtx.drawImage(decoded.bitmap, 0, 0, source.width, source.height);
  decoded.bitmap.close();
  sourceName = file.name;
  // The visible canvas holds a screen-sized copy; picks read the full-size one.
  const v = Math.min(1, 1600 / Math.max(source.width, source.height));
  canvas.width = Math.max(1, Math.round(source.width * v));
  canvas.height = Math.max(1, Math.round(source.height * v));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  picked = undefined;
  picks = [];
  cursor = { x: Math.floor(source.width / 2), y: Math.floor(source.height / 2) };
  panel.hidden = false;
  renderPicks();
  computePalette();
  // Start the card on the most common colour, so it is never a meaningless white.
  if (main[0]) show(main[0].rgb, 'The most common colour. Move over the image to see others.');
}

function hideImage() {
  source = undefined;
  sourceCtx = undefined;
  panel.hidden = true;
}

/* ------------------------------------------------------------------ */
/* Pointer, magnifier and keyboard                                     */
/* ------------------------------------------------------------------ */
function toSource(clientX: number, clientY: number): { x: number; y: number } {
  const b = canvas.getBoundingClientRect();
  const x = Math.floor(((clientX - b.left) / b.width) * source!.width);
  const y = Math.floor(((clientY - b.top) / b.height) * source!.height);
  return { x: Math.min(source!.width - 1, Math.max(0, x)), y: Math.min(source!.height - 1, Math.max(0, y)) };
}

function drawLoupe(p: { x: number; y: number }) {
  const b = canvas.getBoundingClientRect();
  const stageBox = canvas.parentElement!.getBoundingClientRect();
  const ctx = loupeCanvas.getContext('2d')!;
  const half = (LOUPE_PIXELS - 1) / 2;
  const cell = loupeCanvas.width / LOUPE_PIXELS;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, loupeCanvas.width, loupeCanvas.height);
  ctx.drawImage(source!, p.x - half, p.y - half, LOUPE_PIXELS, LOUPE_PIXELS, 0, 0, loupeCanvas.width, loupeCanvas.height);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let i = 1; i < LOUPE_PIXELS; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell + 0.5, 0);
    ctx.lineTo(i * cell + 0.5, loupeCanvas.height);
    ctx.moveTo(0, i * cell + 0.5);
    ctx.lineTo(loupeCanvas.width, i * cell + 0.5);
    ctx.stroke();
  }
  // The pixel that will be picked, outlined in black and white so it shows on any colour.
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(half * cell, half * cell, cell, cell);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(half * cell - 1.5, half * cell - 1.5, cell + 3, cell + 3);
  loupe.hidden = false;
  loupe.style.left = `${b.left - stageBox.left + ((p.x + 0.5) / source!.width) * b.width}px`;
  loupe.style.top = `${b.top - stageBox.top + ((p.y + 0.5) / source!.height) * b.height}px`;
}

function hover(p: { x: number; y: number }) {
  cursor = p;
  drawLoupe(p);
  show(colorAt(p.x, p.y), 'Under the cursor. Click or tap to pick.');
}

function pick(p: { x: number; y: number }) {
  const rgb = colorAt(p.x, p.y);
  picked = rgb;
  const hex = toHex(rgb);
  picks = [rgb, ...picks.filter((c) => toHex(c) !== hex)].slice(0, 16);
  renderPicks();
  showPicked();
  panel.dataset.picked = hex;
}

let pressed = false;
canvas.addEventListener('pointerdown', (e) => {
  if (!source || e.button !== 0) return;
  pressed = true;
  canvas.setPointerCapture(e.pointerId);
  hover(toSource(e.clientX, e.clientY));
});
canvas.addEventListener('pointermove', (e) => {
  if (!source || (e.pointerType !== 'mouse' && !pressed)) return;
  hover(toSource(e.clientX, e.clientY));
});
canvas.addEventListener('pointerup', (e) => {
  if (!source || !pressed) return;
  pressed = false;
  pick(toSource(e.clientX, e.clientY));
  // On touch the finger lifts off, so the magnifier goes with it.
  if (e.pointerType !== 'mouse') loupe.hidden = true;
});
canvas.addEventListener('pointercancel', () => {
  pressed = false;
  loupe.hidden = true;
});
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType !== 'mouse' || pressed) return;
  loupe.hidden = true;
  showPicked();
});
canvas.addEventListener('keydown', (e) => {
  if (!source) return;
  const step = e.shiftKey ? 10 : 1;
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const m = moves[e.key];
  if (m) {
    e.preventDefault();
    hover({ x: Math.min(source.width - 1, Math.max(0, cursor.x + m[0])), y: Math.min(source.height - 1, Math.max(0, cursor.y + m[1])) });
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    pick(cursor);
  }
});
canvas.addEventListener('blur', () => (loupe.hidden = true));

for (const b of document.querySelectorAll<HTMLButtonElement>('.color-copy')) {
  b.addEventListener('click', () => void copy($(b.dataset.copy!).textContent ?? '', b));
}
document.getElementById('colors')?.addEventListener('change', computePalette);

/* ------------------------------------------------------------------ */
/* Save palette                                                        */
/* ------------------------------------------------------------------ */
/** A palette card: one row of the main colours, then the picked ones, each with its HEX code. */
function paletteImage(rows: { title: string; colors: RGB[] }[]): HTMLCanvasElement {
  const cols = Math.max(...rows.map((r) => r.colors.length));
  const sw = 160;
  const sh = 120;
  const label = 44;
  const pad = 32;
  const title = 36;
  const c = document.createElement('canvas');
  c.width = pad * 2 + cols * sw;
  c.height = pad + rows.length * (title + sh + label) + pad / 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  let y = pad;
  for (const row of rows) {
    ctx.fillStyle = '#1b1f1e';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(row.title, pad, y);
    y += title;
    row.colors.forEach((rgb, i) => {
      ctx.fillStyle = toHex(rgb);
      ctx.fillRect(pad + i * sw, y, sw, sh);
      ctx.fillStyle = '#1b1f1e';
      ctx.font = '600 18px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(toHex(rgb), pad + i * sw + 4, y + sh + 10);
    });
    y += sh + label;
  }
  return c;
}

const shell = createShell({
  autoDownloadSingle: false,
  async onFilesChanged(files) {
    if (files.length === 0) return hideImage();
    try {
      await showImage(files[0]!.file);
    } catch (e) {
      hideImage();
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  resultsTitle: () => 'Palette saved',
  async process(files, progress) {
    if (!source) await showImage(files[0]!.file);
    progress.set('Drawing the palette…', 0.5);
    const rows = [{ title: 'Main colours', colors: main.map((s) => s.rgb) }];
    if (picks.length) rows.push({ title: 'Picked', colors: picks });
    const img = paletteImage(rows);
    const blob = await canvasToBlob(img, 'image/png');
    const bitmap = await createImageBitmap(img);
    const text = rows.map((r) => `${r.title}\n${r.colors.map((c) => `${toHex(c)}  ${toRgbString(c)}`).join('\n')}`).join('\n\n');
    const out: OutputFile = {
      name: suffixName(sourceName || files[0]!.file.name, '-palette', 'png'),
      blob,
      previewUrl: await thumbnail(bitmap),
      text,
      note: `${main.length} main colours${picks.length ? `, ${picks.length} picked` : ''}`,
    };
    bitmap.close();
    progress.set('Done', 1);
    return [out];
  },
});
