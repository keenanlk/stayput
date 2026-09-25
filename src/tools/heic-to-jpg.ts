import { createShell, bindRange, num, radio, bool } from '../lib/shell';
import { decodeImage, encodeBitmap, thumbnail, type EncodeType } from '../lib/image';
import { heifExifTiff, jpegWithExif, withNormalOrientation, extractExifTiff } from '../lib/exif';
import { replaceExt, type OutputFile } from '../lib/files';

bindRange('quality', 'quality-out');

createShell({
  async process(files, progress) {
    const type: EncodeType = radio('format', 'jpg') === 'png' ? 'image/png' : 'image/jpeg';
    const quality = num('quality', 92) / 100;
    const keepExif = bool('keep-exif');
    const outs: OutputFile[] = [];
    for (const [i, entry] of files.entries()) {
      progress.set(`Converting ${entry.file.name} (${i + 1} of ${files.length})`, i / files.length);
      const decoded = await decodeImage(entry.file);
      let blob = await encodeBitmap(decoded.bitmap, { type, quality });
      if (keepExif && type === 'image/jpeg') {
        const src = new Uint8Array(await entry.file.arrayBuffer());
        const tiff = decoded.heic ? heifExifTiff(src) : extractExifTiff(src);
        if (tiff) {
          const jpeg = new Uint8Array(await blob.arrayBuffer());
          blob = new Blob([jpegWithExif(jpeg, withNormalOrientation(tiff)) as BlobPart], { type: 'image/jpeg' });
        }
      }
      outs.push({
        name: replaceExt(entry.file.name, type === 'image/png' ? 'png' : 'jpg'),
        blob,
        originalSize: entry.file.size,
        previewUrl: await thumbnail(decoded.bitmap),
      });
      decoded.bitmap.close();
    }
    progress.set('Done', 1);
    return outs;
  },
});
