import { createShell, num, str, describeError, type Skipped } from '../lib/shell';
import { decodeImage, encodeBitmap, thumbnail } from '../lib/image';
import { imagesToPdf, type EmbeddableImage, type PageSize } from '../lib/pdf';
import { extractExifTiff, parseTiff, sniffFormat } from '../lib/exif';
import type { OutputFile } from '../lib/files';

const MM_TO_PT = 72 / 25.4;

createShell({
  async thumbnail(file) {
    const d = await decodeImage(file);
    const url = await thumbnail(d.bitmap, 88);
    d.bitmap.close();
    return url;
  },
  async process(files, progress) {
    const images: EmbeddableImage[] = [];
    const skipped: Skipped[] = [];
    let firstError: unknown;
    for (const [i, entry] of files.entries()) {
      progress.set(`Preparing ${entry.file.name} (${i + 1} of ${files.length})`, (i / files.length) * 0.7);
      try {
        images.push(await prepare(entry.file));
      } catch (e) {
        console.warn(`${entry.file.name}:`, e);
        firstError ??= e;
        skipped.push({ name: entry.file.name, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    if (images.length === 0) throw new Error(describeError(files[0]!.file, firstError ?? 'no images'));
    const pageSize = str('page-size', 'fit') as PageSize;
    const orientation = str('orientation', 'auto') as 'auto' | 'portrait' | 'landscape';
    const margin = num('margin', 0) * MM_TO_PT;
    const bytes = await imagesToPdf(images, { pageSize, orientation, margin }, (done) => progress.set(`Adding page ${done} of ${images.length}`, 0.7 + (done / images.length) * 0.3));
    const out: OutputFile = {
      name: files.length === 1 ? `${files[0]!.file.name.replace(/\.[^.]+$/, '')}.pdf` : 'images.pdf',
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      note: `${images.length} page${images.length === 1 ? '' : 's'}`,
    };
    return { outputs: [out], skipped };
  },
  resultsTitle: () => 'PDF created',
});

/** PNGs and upright JPEGs are embedded as-is; everything else is decoded and re-encoded with EXIF orientation applied. */
async function prepare(file: File): Promise<EmbeddableImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffFormat(bytes);
  if (format === 'png') return { kind: 'png', bytes };
  if (format === 'jpeg') {
    const tiff = extractExifTiff(bytes);
    const orientation = tiff ? parseTiff(tiff).orientation ?? 1 : 1;
    if (orientation === 1) return { kind: 'jpg', bytes };
  }
  const decoded = await decodeImage(file);
  const blob = await encodeBitmap(decoded.bitmap, { type: 'image/jpeg', quality: 0.92 });
  decoded.bitmap.close();
  return { kind: 'jpg', bytes: new Uint8Array(await blob.arrayBuffer()) };
}
