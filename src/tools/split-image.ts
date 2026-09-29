import { createShell, processEach, bindRange, num, str, radio } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { baseName, type OutputFile } from '../lib/files';
import { planGrid, type TileShape } from '../lib/image-grid';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('grid-panel');
const canvas = $<HTMLCanvasElement>('grid-canvas');
const hint = $('grid-hint');
const layout = $<HTMLSelectElement>('layout');
const colsIn = $<HTMLInputElement>('cols');
const rowsIn = $<HTMLInputElement>('rows');

bindRange('quality', 'quality-out');

const clampN = (v: number) => Math.min(10, Math.max(1, Math.round(v) || 1));
const cols = () => clampN(Number(colsIn.value));
const rows = () => clampN(Number(rowsIn.value));
const shape = () => str('shape', 'original') as TileShape;

layout.addEventListener('change', () => {
  const [c, r] = layout.value.split('x');
  colsIn.value = c!;
  rowsIn.value = r!;
  redraw();
});
for (const el of [colsIn, rowsIn]) {
  el.addEventListener('input', () => {
    const match = [...layout.options].find((o) => o.value === `${cols()}x${rows()}`);
    if (match) layout.value = match.value;
    redraw();
  });
}
$('shape').addEventListener('change', redraw);

let preview: ImageBitmap | undefined;
let count = 0;

function redraw() {
  if (!preview) return;
  const scale = Math.min(1, 1400 / Math.max(preview.width, preview.height));
  const w = Math.max(1, Math.round(preview.width * scale));
  const h = Math.max(1, Math.round(preview.height * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(preview, 0, 0, w, h);
  const full = planGrid(preview.width, preview.height, cols(), rows(), shape());
  const s = (v: number) => v * scale;
  // Dim what is cut away.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(s(full.crop.x), s(full.crop.y), s(full.crop.w), s(full.crop.h));
  ctx.fill('evenodd');
  ctx.lineWidth = Math.max(1.5, w / 400);
  ctx.strokeStyle = '#fff';
  ctx.setLineDash([Math.max(4, w / 120), Math.max(3, w / 180)]);
  ctx.beginPath();
  for (let c = 1; c < cols(); c++) {
    const x = s(full.crop.x + c * full.tileW);
    ctx.moveTo(x, s(full.crop.y));
    ctx.lineTo(x, s(full.crop.y + full.crop.h));
  }
  for (let r = 1; r < rows(); r++) {
    const y = s(full.crop.y + r * full.tileH);
    ctx.moveTo(s(full.crop.x), y);
    ctx.lineTo(s(full.crop.x + full.crop.w), y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  panel.dataset.plan = `${cols()}x${rows()},${full.tileW}x${full.tileH}`;
  hint.textContent = `${cols() * rows()} tiles of ${full.tileW} × ${full.tileH} px.${count > 1 ? ` Each of the ${count} images is cut the same way.` : ''}`;
}

function outputType(file: File, choice: string): EncodeType {
  if (choice !== 'keep') return choice as EncodeType;
  if (file.type === 'image/png') return 'image/png';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

const shell = createShell({
  async onFilesChanged(files) {
    count = files.length;
    preview?.close();
    preview = undefined;
    if (files.length === 0) {
      panel.hidden = true;
      return;
    }
    try {
      preview = (await decodeImage(files[0]!.file)).bitmap;
      panel.hidden = false;
      redraw();
    } catch (e) {
      panel.hidden = true;
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const c = cols();
    const r = rows();
    if (c * r < 2) throw new Error('Choose at least two tiles; one tile would be the same picture.');
    const sh = shape();
    const post = radio('order', 'reading') === 'post';
    const choice = str('format', 'keep');
    const quality = num('quality', 92) / 100;
    return processEach(files, progress, 'Splitting', async (entry) => {
      const decoded = await decodeImage(entry.file);
      const bmp = decoded.bitmap;
      const plan = planGrid(bmp.width, bmp.height, c, r, sh);
      const type = outputType(entry.file, choice);
      const total = plan.tiles.length;
      const pad = String(total).length;
      const outs: OutputFile[] = [];
      for (const [i, t] of plan.tiles.entries()) {
        const n = post ? total - i : i + 1;
        const tile = document.createElement('canvas');
        tile.width = t.w;
        tile.height = t.h;
        const ctx = tile.getContext('2d')!;
        if (type === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, t.w, t.h);
        }
        ctx.drawImage(bmp, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
        const blob = await canvasToBlob(tile, type, type === 'image/png' ? undefined : quality);
        if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
        const thumb = await createImageBitmap(tile);
        outs.push({
          name: `${baseName(entry.file.name)}-${String(n).padStart(pad, '0')}.${extForType(type)}`,
          blob,
          previewUrl: await thumbnail(thumb),
          note: `row ${t.row + 1}, column ${t.col + 1}, ${t.w}×${t.h}${post ? `, post ${n === 1 ? 'first' : n === total ? 'last' : `number ${n}`}` : ''}`,
        });
        thumb.close();
      }
      bmp.close();
      return outs.sort((a, b) => a.name.localeCompare(b.name));
    });
  },
});
