import { createShell, bindRange, num, str, radio, bool, type ShellFile } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import type { OutputFile } from '../lib/files';
import { planCollage, type CollageOptions, type Fit, type Layout, type Size } from '../lib/collage';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('collage-panel');
const canvas = $<HTMLCanvasElement>('collage-canvas');
const hint = $('collage-hint');
const background = $<HTMLInputElement>('background');
const transparent = $<HTMLInputElement>('transparent');
const format = $<HTMLSelectElement>('format');

bindRange('quality', 'quality-out');
bindRange('gap', 'gap-out');

function options(maxSide = num('size', 2400)): CollageOptions {
  return {
    layout: radio('layout', 'grid') as Layout,
    columns: Number(str('columns', '0')),
    fit: str('fit', 'fill') as Fit,
    gap: num('gap', 2) / 100,
    maxSide,
  };
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, clear: boolean) {
  if (clear) ctx.clearRect(0, 0, w, h);
  else {
    ctx.fillStyle = background.value;
    ctx.fillRect(0, 0, w, h);
  }
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */
let previews: ImageBitmap[] = [];
let sizes: Size[] = [];

function redraw() {
  $('grid-fields').hidden = radio('layout', 'grid') !== 'grid';
  if (transparent.checked && format.value === 'image/jpeg') format.value = 'image/png';
  if (!previews.length) return;
  const full = planCollage(sizes, options());
  const view = planCollage(sizes, options(Math.min(1200, Math.max(full.width, full.height))));
  canvas.width = view.width;
  canvas.height = view.height;
  const ctx = canvas.getContext('2d')!;
  paint(ctx, view.width, view.height, transparent.checked);
  view.cells.forEach((c, i) => {
    const p = previews[i]!;
    // Previews are smaller than the originals: scale the source rectangle to match.
    const k = p.width / sizes[i]!.width;
    ctx.drawImage(p, c.sx * k, c.sy * k, c.sw * k, c.sh * k, c.dx, c.dy, c.dw, c.dh);
  });
  panel.dataset.size = `${full.width}x${full.height}`;
  hint.textContent = `${previews.length} picture${previews.length === 1 ? '' : 's'}, ${full.width} × ${full.height} px.${previews.length < 2 ? ' Add at least one more picture.' : ''}`;
}

for (const el of document.querySelectorAll<HTMLElement>('input[name="layout"], #columns, #fit, #gap, #background, #transparent, #size, #format')) {
  el.addEventListener('input', redraw);
  el.addEventListener('change', redraw);
}
for (const s of document.querySelectorAll<HTMLButtonElement>('.swatch')) {
  s.addEventListener('click', () => {
    background.value = s.dataset.color!;
    transparent.checked = false;
    redraw();
  });
}

let generation = 0;
async function loadPreviews(files: ShellFile[]) {
  const mine = ++generation;
  const next: ImageBitmap[] = [];
  const nextSizes: Size[] = [];
  for (const f of files) {
    const d = await decodeImage(f.file);
    const k = Math.min(1, 800 / Math.max(d.bitmap.width, d.bitmap.height));
    nextSizes.push({ width: d.bitmap.width, height: d.bitmap.height });
    next.push(await createImageBitmap(d.bitmap, { resizeWidth: Math.max(1, Math.round(d.bitmap.width * k)), resizeHeight: Math.max(1, Math.round(d.bitmap.height * k)), resizeQuality: 'high' }));
    d.bitmap.close();
  }
  if (mine !== generation) {
    next.forEach((b) => b.close());
    return;
  }
  previews.forEach((b) => b.close());
  previews = next;
  sizes = nextSizes;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
const shell = createShell({
  async onFilesChanged(files) {
    if (files.length === 0) {
      generation++;
      previews.forEach((b) => b.close());
      previews = [];
      sizes = [];
      panel.hidden = true;
      return;
    }
    try {
      await loadPreviews(files);
      panel.hidden = false;
      redraw();
    } catch (e) {
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    if (files.length < 2) throw new Error('Add at least two pictures to make a collage.');
    const type = str('format', 'image/jpeg') as EncodeType;
    const clear = bool('transparent') && type !== 'image/jpeg';
    const quality = num('quality', 90) / 100;
    const bitmaps: ImageBitmap[] = [];
    for (const [i, f] of files.entries()) {
      progress.set(`Reading ${f.file.name} (${i + 1} of ${files.length})`, (i / files.length) * 0.7);
      bitmaps.push((await decodeImage(f.file)).bitmap);
    }
    const plan = planCollage(bitmaps.map((b) => ({ width: b.width, height: b.height })), options());
    progress.set('Putting the collage together…', 0.8);
    const c = document.createElement('canvas');
    c.width = plan.width;
    c.height = plan.height;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    paint(ctx, plan.width, plan.height, clear);
    plan.cells.forEach((cell, i) => ctx.drawImage(bitmaps[i]!, cell.sx, cell.sy, cell.sw, cell.sh, cell.dx, cell.dy, cell.dw, cell.dh));
    bitmaps.forEach((b) => b.close());
    const blob = await canvasToBlob(c, type, type === 'image/png' ? undefined : quality);
    if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
    const bmp = await createImageBitmap(c);
    const out: OutputFile = {
      name: `collage.${extForType(type)}`,
      blob,
      originalSize: files.reduce((n, f) => n + f.file.size, 0),
      previewUrl: await thumbnail(bmp),
      note: `${files.length} pictures, ${plan.width}×${plan.height}`,
    };
    bmp.close();
    return [out];
  },
  resultsTitle: () => 'Collage',
});
