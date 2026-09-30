import { createShell, processEach, bindRange, num, radio, str } from '../lib/shell';
import { canvasToBlob, decodeImage, drawScaled, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { sketch, type SketchStyle } from '../lib/sketch';
import { effectPreview } from '../lib/effect-preview';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

bindRange('strokes', 'strokes-out');
bindRange('darkness', 'darkness-out');

const LABEL: Record<SketchStyle, string> = { pencil: 'pencil sketch', charcoal: 'charcoal sketch', color: 'coloured pencil sketch' };

/** Draw the picture on white at up to `longest` pixels and turn it into a sketch. Stroke width scales with the picture, so the preview matches the full-size result. */
function render(bitmap: ImageBitmap, longest?: number) {
  const k = longest ? Math.min(1, longest / Math.max(bitmap.width, bitmap.height)) : 1;
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = drawScaled(bitmap, w, h, '#ffffff');
  const ctx = canvas.getContext('2d') as Ctx;
  const img = ctx.getImageData(0, 0, w, h);
  const radius = Math.max(1, (num('strokes', 8) * Math.max(w, h)) / 1000);
  sketch(img.data, w, h, radio('style', 'pencil') as SketchStyle, radius, num('darkness', 30));
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const shell = createShell({
  onFilesChanged: (files) => onFiles(files),
  async process(files, progress) {
    const style = radio('style', 'pencil') as SketchStyle;
    const type = str('format', 'image/jpeg') as EncodeType;
    return processEach(files, progress, 'Sketching', async (entry) => {
      const decoded = await decodeImage(entry.file);
      try {
        const canvas = render(decoded.bitmap);
        const blob = await canvasToBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined);
        const bmp = await createImageBitmap(canvas);
        const out: OutputFile = {
          name: suffixName(entry.file.name, '-sketch', extForType(type)),
          blob,
          originalSize: entry.file.size,
          previewUrl: await thumbnail(bmp),
          note: `${canvas.width}×${canvas.height}, ${LABEL[style]}`,
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
  (bitmap, maxSide) => render(bitmap, maxSide),
  (count) => `Preview of the first photo.${count > 1 ? ` The same settings apply to all ${count}.` : ''}`,
  (m) => shell.showError(m),
);
