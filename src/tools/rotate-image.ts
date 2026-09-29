import { createShell, processEach, bindRange, num, str, radio, bool } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('rotate-panel');
const canvas = $<HTMLCanvasElement>('rotate-canvas');
const hint = $('rotate-hint');
const flipH = $<HTMLInputElement>('flip-h');
const flipV = $<HTMLInputElement>('flip-v');

bindRange('quality', 'quality-out');

type Turn = 0 | 90 | 180 | 270;
const turn = () => Number(radio('rotate', '0')) as Turn;

/** Draw the bitmap turned clockwise by `deg` and then mirrored, scaled by `scale`. */
function transformed(bitmap: ImageBitmap, deg: Turn, h: boolean, v: boolean, scale = 1, background?: string): HTMLCanvasElement {
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const ht = Math.max(1, Math.round(bitmap.height * scale));
  const sideways = deg === 90 || deg === 270;
  const out = document.createElement('canvas');
  out.width = sideways ? ht : w;
  out.height = sideways ? w : ht;
  const ctx = out.getContext('2d')!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.translate(out.width / 2, out.height / 2);
  ctx.scale(h ? -1 : 1, v ? -1 : 1);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -ht / 2, w, ht);
  return out;
}

function describe(deg: Turn, h: boolean, v: boolean): string {
  const parts: string[] = [];
  if (deg === 90) parts.push('rotated 90° right');
  if (deg === 180) parts.push('rotated 180°');
  if (deg === 270) parts.push('rotated 90° left');
  if (h && v) parts.push('flipped both ways');
  else if (h) parts.push('flipped horizontally');
  else if (v) parts.push('flipped vertically');
  return parts.join(', ');
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */
let preview: ImageBitmap | undefined;
let count = 0;

function redraw() {
  const d = describe(turn(), flipH.checked, flipV.checked);
  panel.dataset.transform = `${turn()},${flipH.checked ? 'h' : ''}${flipV.checked ? 'v' : ''}`;
  hint.textContent = `${d ? `Preview: ${d}.` : 'No change chosen yet: pick a rotation or a flip.'}${count > 1 ? ` The same change applies to all ${count} images.` : ''}`;
  if (!preview) return;
  const scale = Math.min(1, 1200 / Math.max(preview.width, preview.height));
  const c = transformed(preview, turn(), flipH.checked, flipV.checked, scale);
  canvas.width = c.width;
  canvas.height = c.height;
  canvas.getContext('2d')!.drawImage(c, 0, 0);
}

function setTurn(deg: number) {
  const v = String(((deg % 360) + 360) % 360);
  const el = document.querySelector<HTMLInputElement>(`input[name="rotate"][value="${v}"]`);
  if (el) el.checked = true;
  redraw();
}
$('rotate-left').addEventListener('click', () => setTurn(turn() - 90));
$('rotate-right').addEventListener('click', () => setTurn(turn() + 90));
$('flip-h-btn').addEventListener('click', () => {
  flipH.checked = !flipH.checked;
  redraw();
});
$('flip-v-btn').addEventListener('click', () => {
  flipV.checked = !flipV.checked;
  redraw();
});
for (const el of document.querySelectorAll<HTMLInputElement>('input[name="rotate"], #flip-h, #flip-v')) el.addEventListener('change', redraw);

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
    const deg = turn();
    const h = bool('flip-h');
    const v = bool('flip-v');
    if (deg === 0 && !h && !v) throw new Error('Pick a rotation or a flip first; the image would come out unchanged.');
    const choice = str('format', 'keep');
    const quality = num('quality', 92) / 100;
    const d = describe(deg, h, v);
    const suffix = deg === 0 ? '-flipped' : '-rotated';
    return processEach(files, progress, 'Rotating', async (entry) => {
      const decoded = await decodeImage(entry.file);
      const type = outputType(entry.file, choice);
      const c = transformed(decoded.bitmap, deg, h, v, 1, type === 'image/jpeg' ? '#ffffff' : undefined);
      const blob = await canvasToBlob(c, type, type === 'image/png' ? undefined : quality);
      if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
      const bmp = await createImageBitmap(c);
      const out: OutputFile = {
        name: suffixName(entry.file.name, suffix, extForType(type)),
        blob,
        originalSize: entry.file.size,
        previewUrl: await thumbnail(bmp),
        note: `${c.width}×${c.height}, ${d}`,
      };
      bmp.close();
      decoded.bitmap.close();
      return out;
    });
  },
});
