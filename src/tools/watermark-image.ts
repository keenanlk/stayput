import { createShell, processEach, str } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, makeCanvas, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { drawWatermark } from '../lib/watermark';
import { requireText, setPreview, watermarkOptions } from './watermark-common';

function outputType(file: File, choice: string): EncodeType {
  if (choice !== 'keep') return choice as EncodeType;
  if (file.type === 'image/png') return 'image/png';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

let previewBitmap: ImageBitmap | undefined;

const shell = createShell({
  async onFilesChanged(files) {
    previewBitmap?.close();
    previewBitmap = undefined;
    if (files.length === 0) return setPreview(undefined);
    try {
      const { bitmap } = await decodeImage(files[0]!.file);
      const s = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      previewBitmap = await createImageBitmap(bitmap, { resizeWidth: Math.max(1, Math.round(bitmap.width * s)), resizeHeight: Math.max(1, Math.round(bitmap.height * s)), resizeQuality: 'high' });
      bitmap.close();
      setPreview(previewBitmap, files.length > 1 ? `Preview of the first photo. The same watermark goes on all ${files.length}, scaled to each one’s size.` : 'Preview. The saved photo is full size.');
    } catch (e) {
      setPreview(undefined);
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const o = watermarkOptions();
    requireText(o);
    const choice = str('format', 'keep');
    return processEach(files, progress, 'Watermarking', async (entry) => {
      const { bitmap } = await decodeImage(entry.file);
      try {
        const type = outputType(entry.file, choice);
        const c = makeCanvas(bitmap.width, bitmap.height);
        const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
        if (type === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
        }
        ctx.drawImage(bitmap, 0, 0);
        drawWatermark(ctx, c.width, c.height, o);
        const blob = await canvasToBlob(c, type, type === 'image/png' ? undefined : 0.92);
        if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
        const bmp = await createImageBitmap(blob);
        const out: OutputFile = {
          name: suffixName(entry.file.name, '-watermarked', extForType(type)),
          blob,
          previewUrl: await thumbnail(bmp),
          note: `${c.width}×${c.height}`,
        };
        bmp.close();
        return out;
      } finally {
        bitmap.close();
      }
    });
  },
});
