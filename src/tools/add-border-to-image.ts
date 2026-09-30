import { createShell, processEach, bindRange, num, str } from '../lib/shell';
import { canvasToBlob, decodeImage, drawScaled, extForType, makeCanvas, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { effectPreview } from '../lib/effect-preview';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

bindRange('border', 'border-out', (v) => `${v}%`);
bindRange('radius', 'radius-out', (v) => `${v}%`);

/**
 * Frame the picture: the border is a share of its shorter side on every edge,
 * and the corner radius a share of the framed picture's shorter side (50% makes
 * a circle or pill). Outside the rounded corners stays transparent, or white
 * for JPG.
 */
function render(bitmap: ImageBitmap, longest: number | undefined, jpeg: boolean) {
  const k = longest ? Math.min(1, longest / Math.max(bitmap.width, bitmap.height)) : 1;
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const b = Math.round((num('border', 4) / 100) * Math.min(w, h));
  const W = w + 2 * b;
  const H = h + 2 * b;
  const R = (num('radius', 0) / 100) * Math.min(W, H);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d') as Ctx;
  if (jpeg) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, R);
  ctx.clip();
  if (b > 0) {
    ctx.fillStyle = str('border-color', '#ffffff');
    ctx.fillRect(0, 0, W, H);
  }
  ctx.beginPath();
  ctx.roundRect(b, b, w, h, Math.max(0, R - b));
  ctx.clip();
  ctx.drawImage(k === 1 ? bitmap : drawScaled(bitmap, w, h), b, b, w, h);
  ctx.restore();
  return { canvas, b, R };
}

function outputType(file: File): EncodeType {
  const choice = str('format', 'auto');
  if (choice !== 'auto') return choice as EncodeType;
  if (num('radius', 0) > 0) return 'image/png';
  if (file.type === 'image/png' || file.type === 'image/webp') return file.type;
  return 'image/jpeg';
}

const shell = createShell({
  onFilesChanged: (files) => onFiles(files),
  async process(files, progress) {
    return processEach(files, progress, 'Framing', async (entry) => {
      const decoded = await decodeImage(entry.file);
      const type = outputType(entry.file);
      try {
        const { canvas, b, R } = render(decoded.bitmap, undefined, type === 'image/jpeg');
        const blob = await canvasToBlob(canvas, type, type === 'image/png' ? undefined : 0.92);
        if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
        const bmp = await createImageBitmap(canvas);
        const notes = [`${canvas.width}×${canvas.height}`];
        if (b) notes.push(`${b} px border`);
        if (R) notes.push(`${Math.round(R)} px corners`);
        const out: OutputFile = {
          name: suffixName(entry.file.name, b ? '-border' : '-rounded', extForType(type)),
          blob,
          originalSize: entry.file.size,
          previewUrl: await thumbnail(bmp),
          note: notes.join(', '),
        };
        bmp.close();
        return out;
      } finally {
        decoded.bitmap.close();
      }
    });
  },
});

const onFiles = effectPreview(
  (bitmap, maxSide) => render(bitmap, maxSide, false).canvas,
  (count) => `Preview of the first picture.${count > 1 ? ` The same frame applies to all ${count}.` : ''}`,
  (m) => shell.showError(m),
);
