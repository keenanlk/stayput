import { createShell, bindRange, num, str, bool } from '../lib/shell';
import { decodeImage, encodeBitmap, extForType, supportsWebpEncoding, thumbnail, type EncodeType } from '../lib/image';
import { extractExifTiff, jpegWithExif, withNormalOrientation } from '../lib/exif';
import { replaceExt, type OutputFile } from '../lib/files';

bindRange('quality', 'quality-out');

void supportsWebpEncoding().then((ok) => {
  if (ok) return;
  const opt = document.querySelector<HTMLOptionElement>('#format option[value="image/webp"]');
  if (opt) {
    opt.disabled = true;
    opt.textContent = 'WebP (not supported by this browser)';
  }
});

const formatSel = document.getElementById('format') as HTMLSelectElement;
const syncFormat = () => {
  const t = formatSel.value;
  document.getElementById('quality-field')!.hidden = t === 'image/png';
  document.getElementById('background-field')!.hidden = t !== 'image/jpeg';
  document.getElementById('exif-field')!.hidden = t !== 'image/jpeg';
};
formatSel.addEventListener('change', syncFormat);
syncFormat();

createShell({
  async process(files, progress) {
    const type = str('format', 'image/jpeg') as EncodeType;
    const quality = num('quality', 90) / 100;
    const background = str('background', '#ffffff');
    const keepExif = bool('keep-exif') && type === 'image/jpeg';
    const outs: OutputFile[] = [];
    for (const [i, entry] of files.entries()) {
      progress.set(`Converting ${entry.file.name} (${i + 1} of ${files.length})`, i / files.length);
      const decoded = await decodeImage(entry.file);
      let blob = await encodeBitmap(decoded.bitmap, { type, quality, background });
      if (keepExif) {
        const tiff = extractExifTiff(new Uint8Array(await entry.file.arrayBuffer()));
        if (tiff) {
          const jpeg = new Uint8Array(await blob.arrayBuffer());
          blob = new Blob([jpegWithExif(jpeg, withNormalOrientation(tiff)) as BlobPart], { type });
        }
      }
      outs.push({ name: replaceExt(entry.file.name, extForType(type)), blob, originalSize: entry.file.size, previewUrl: await thumbnail(decoded.bitmap) });
      decoded.bitmap.close();
    }
    progress.set('Done', 1);
    return outs;
  },
});
