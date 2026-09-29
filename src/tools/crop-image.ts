import { createShell, bindRange, num, str, radio } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { cropBox } from '../lib/crop-box';

bindRange('quality', 'quality-out');

let bitmap: ImageBitmap | undefined;

async function showImage(file: File) {
  bitmap?.close();
  bitmap = undefined;
  const decoded = await decodeImage(file);
  bitmap = decoded.bitmap;
  cropBox.show(bitmap, decoded.width, decoded.height);
}

function hideImage() {
  bitmap?.close();
  bitmap = undefined;
  cropBox.hide();
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
function outputType(file: File, choice: string, circle: boolean): EncodeType {
  let type: EncodeType;
  if (choice !== 'keep') type = choice as EncodeType;
  else if (file.type === 'image/png') type = 'image/png';
  else if (file.type === 'image/webp') type = 'image/webp';
  else type = 'image/jpeg';
  // A circle needs transparency, which JPG cannot carry.
  if (circle && type === 'image/jpeg') type = 'image/png';
  return type;
}

const shell = createShell({
  async onFilesChanged(files) {
    if (files.length === 0) return hideImage();
    try {
      await showImage(files[0]!.file);
    } catch (e) {
      hideImage();
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (!bitmap || !cropBox.size().width) await showImage(entry.file);
    const rect = cropBox.rect();
    const circle = radio('shape', 'rect') === 'circle';
    const type = outputType(entry.file, str('format', 'keep'), circle);
    const quality = num('quality', 92) / 100;
    progress.set('Cropping…', 0.3);
    const out = document.createElement('canvas');
    out.width = rect.w;
    out.height = rect.h;
    const ctx = out.getContext('2d')!;
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.w, rect.h);
    }
    if (circle) {
      ctx.beginPath();
      ctx.ellipse(rect.w / 2, rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(bitmap!, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    const blob = await canvasToBlob(out, type, type === 'image/png' ? undefined : quality);
    if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
    const preview = await createImageBitmap(out);
    const outs: OutputFile[] = [
      {
        name: suffixName(entry.file.name, circle ? '-circle' : '-cropped', extForType(type)),
        blob,
        originalSize: entry.file.size,
        previewUrl: await thumbnail(preview),
        note: `${rect.w}×${rect.h}${circle ? ', circle' : ''}`,
      },
    ];
    preview.close();
    progress.set('Done', 1);
    return outs;
  },
});
