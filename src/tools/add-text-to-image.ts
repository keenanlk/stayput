import { createShell, processEach, bindRange, num, str } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { drawText, loadFont } from '../lib/image-text';
import { createTextStage } from '../lib/text-stage';
import { InputError, NamedError } from '../lib/input-error';

bindRange('quality', 'quality-out');
const stage = createTextStage();
let count = 0;

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
    if (files.length === 0) {
      stage.show(undefined);
      return;
    }
    try {
      const bitmap = (await decodeImage(files[0]!.file)).bitmap;
      stage.show(bitmap, `Drag the text on the picture to move it.${count > 1 ? ` The same text goes in the same place on all ${count} images.` : ''}`);
    } catch (e) {
      stage.show(undefined);
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const list = stage.blocks();
    if (!list.some((b) => b.text.trim())) throw new InputError('Type some text first; the image would come out unchanged.');
    const s = stage.style();
    await loadFont(s.font);
    const choice = str('format', 'keep');
    const quality = num('quality', 92) / 100;
    return processEach(files, progress, 'Adding text to', async (entry) => {
      const decoded = await decodeImage(entry.file);
      const type = outputType(entry.file, choice);
      const c = document.createElement('canvas');
      c.width = decoded.bitmap.width;
      c.height = decoded.bitmap.height;
      const ctx = c.getContext('2d')!;
      if (type === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
      }
      ctx.drawImage(decoded.bitmap, 0, 0);
      drawText(ctx, c.width, c.height, list, s);
      const blob = await canvasToBlob(c, type, type === 'image/png' ? undefined : quality);
      if (blob.type !== type) throw new NamedError('AddTextToImageFailed', `This browser cannot save ${extForType(type).toUpperCase()} images.`);
      const bmp = await createImageBitmap(c);
      const out: OutputFile = {
        name: suffixName(entry.file.name, '-text', extForType(type)),
        blob,
        originalSize: entry.file.size,
        previewUrl: await thumbnail(bmp),
        note: `${c.width}×${c.height}, text added`,
      };
      bmp.close();
      decoded.bitmap.close();
      return out;
    });
  },
});
