import { createShell, processEach, bindRange, num, str, radio } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { upscaleImage } from '../lib/upscale';

bindRange('quality', 'quality-out');

function outputType(file: File, choice: string): EncodeType {
  if (choice !== 'keep') return choice as EncodeType;
  if (file.type === 'image/jpeg') return 'image/jpeg';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/png';
}

const fmt = (f: number) => `${Number.isInteger(f) ? f : f.toFixed(1)}×`;

createShell({
  async process(files, progress) {
    const factor = Number(radio('scale', '4'));
    const choice = str('format', 'keep');
    const quality = num('quality', 92) / 100;
    return processEach(files, progress, 'Upscaling', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const decoded = await decodeImage(entry.file);
      const type = outputType(entry.file, choice);
      try {
        const { canvas, factor: made } = await upscaleImage(decoded.bitmap, factor, {
          background: type === 'image/jpeg' ? '#ffffff' : undefined,
          onLoading: (f) => progress.set(`Downloading the upscaling model (4.9 MB, once): ${Math.round(f * 100)}%`, share(0.05)),
          onProgress: (f) => progress.set(`Upscaling ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.1 + f * 0.8)),
        });
        progress.set(`Saving ${entry.file.name}…`, share(0.95));
        const blob = await canvasToBlob(canvas, type, type === 'image/png' ? undefined : quality);
        if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
        const bmp = await createImageBitmap(canvas);
        const capped = made < factor - 0.01 ? `, held to ${fmt(made)} (the largest a browser can hold)` : '';
        const out: OutputFile = {
          name: suffixName(entry.file.name, `-${Math.round(made)}x`, extForType(type)),
          blob,
          originalSize: entry.file.size,
          previewUrl: await thumbnail(bmp),
          note: `${decoded.bitmap.width}×${decoded.bitmap.height} to ${canvas.width}×${canvas.height}${capped}`,
        };
        bmp.close();
        return out;
      } finally {
        decoded.bitmap.close();
      }
    });
  },
});
