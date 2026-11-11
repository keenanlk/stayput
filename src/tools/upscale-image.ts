import { createShell, processEach, bindRange, num, str, radio } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { upscaleImage } from '../lib/upscale';
import { NamedError } from '../lib/input-error';
import { UPSCALE_COPY } from '../lib/upscale-copy';

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
        const { canvas, factor: made, smaller } = await upscaleImage(decoded.bitmap, factor, {
          background: type === 'image/jpeg' ? '#ffffff' : undefined,
          onLoading: (f) => progress.set(`Downloading the upscaling model (4.9 MB, once): ${Math.round(f * 100)}%`, share(0.05)),
          onProgress: (f) => progress.set(`Upscaling ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.1 + f * 0.8)),
        });
        progress.set(`Saving ${entry.file.name}…`, share(0.95));
        const format = extForType(type).toUpperCase();
        let blob: Blob;
        try {
          blob = await canvasToBlob(canvas, type, type === 'image/png' ? undefined : quality);
        } catch (e) {
          // A picture too big to encode is a memory failure; anything else is the save step.
          throw e instanceof Error && e.name === 'OutOfMemoryError' ? e : new NamedError('UpscaleSaveFailed', UPSCALE_COPY.save(format), { cause: e });
        }
        if (blob.type !== type) throw new NamedError('UpscaleSaveFailed', UPSCALE_COPY.save(format));
        // The small preview is a courtesy: a browser that cannot make one still hands over the picture.
        let previewUrl: string | undefined;
        try {
          const bmp = await createImageBitmap(canvas);
          previewUrl = await thumbnail(bmp);
          bmp.close();
        } catch {
          previewUrl = undefined;
        }
        const why = smaller === 'memory' ? `, ${UPSCALE_COPY.smallerMemory(fmt(made))}` : smaller === 'device' ? `, ${UPSCALE_COPY.smallerDevice(fmt(made))}` : '';
        const capped = !smaller && made < factor - 0.01 ? `, held to ${fmt(made)} (the largest a browser can hold)` : '';
        const out: OutputFile = {
          name: suffixName(entry.file.name, `-${Math.round(made)}x`, extForType(type)),
          blob,
          originalSize: entry.file.size,
          previewUrl,
          note: `${decoded.bitmap.width}×${decoded.bitmap.height} to ${canvas.width}×${canvas.height}${capped}${why}`,
        };
        return out;
      } finally {
        decoded.bitmap.close();
      }
    });
  },
});
