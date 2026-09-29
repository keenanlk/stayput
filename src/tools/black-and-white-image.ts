import { createShell, processEach, bindRange, num, str, radio } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { toMono, type MonoMode } from '../lib/mono';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('mono-panel');
const canvas = $<HTMLCanvasElement>('mono-canvas');
const hint = $('mono-hint');

bindRange('quality', 'quality-out');

const LABEL: Record<MonoMode, string> = { gray: 'grayscale', contrast: 'high-contrast grayscale', bw: 'pure black and white', sepia: 'sepia' };
const mode = () => radio('mode', 'gray') as MonoMode;

/** Draw the bitmap (on white where the output cannot hold transparency) and apply the look. */
function render(bitmap: ImageBitmap, m: MonoMode, scale = 1, background?: string): { canvas: HTMLCanvasElement; threshold?: number } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bitmap.width * scale));
  c.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const threshold = toMono(img.data, m);
  ctx.putImageData(img, 0, 0);
  return { canvas: c, threshold };
}

let preview: ImageBitmap | undefined;
let count = 0;
function redraw() {
  if (!preview) return;
  const scale = Math.min(1, 1200 / Math.max(preview.width, preview.height));
  const { canvas: c } = render(preview, mode(), scale, '#ffffff');
  canvas.width = c.width;
  canvas.height = c.height;
  canvas.getContext('2d')!.drawImage(c, 0, 0);
  panel.dataset.mode = mode();
  hint.textContent = `Preview: ${LABEL[mode()]}.${count > 1 ? ` The same look applies to all ${count} images.` : ''}`;
}
for (const el of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) el.addEventListener('change', redraw);

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
    const m = mode();
    const choice = str('format', 'keep');
    const quality = num('quality', 92) / 100;
    const suffix = m === 'sepia' ? '-sepia' : m === 'gray' ? '-grayscale' : '-bw';
    return processEach(files, progress, 'Converting', async (entry) => {
      const decoded = await decodeImage(entry.file);
      const type = outputType(entry.file, choice);
      try {
        const { canvas: c } = render(decoded.bitmap, m, 1, type === 'image/jpeg' ? '#ffffff' : undefined);
        const blob = await canvasToBlob(c, type, type === 'image/png' ? undefined : quality);
        if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
        const bmp = await createImageBitmap(c);
        const out: OutputFile = {
          name: suffixName(entry.file.name, suffix, extForType(type)),
          blob,
          originalSize: entry.file.size,
          previewUrl: await thumbnail(bmp),
          note: `${c.width}×${c.height}, ${LABEL[m]}`,
        };
        bmp.close();
        return out;
      } finally {
        decoded.bitmap.close();
      }
    });
  },
});
