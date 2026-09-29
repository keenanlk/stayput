/**
 * TIFF decoding for browsers without a native decoder (every browser but
 * Safari). UTIF.js is bundled with the site and loaded only when a TIFF
 * arrives, so nothing is fetched from anywhere else.
 */
import { extOf, readHead } from './files';

/** True when the file is a TIFF by name, type or signature. */
export async function isTiffFile(file: Blob & { name?: string }): Promise<boolean> {
  const ext = file.name ? extOf(file.name) : '';
  if (ext === 'tif' || ext === 'tiff' || file.type === 'image/tiff') return true;
  const b = await readHead(file, 4);
  return b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42 && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42));
}

/**
 * Decode the pages of a TIFF, in order, up to `maxPages`. Reduced-resolution
 * previews that some scanners store beside each page are skipped.
 */
export async function decodeTiffPages(file: Blob, maxPages = Infinity): Promise<ImageBitmap[]> {
  const UTIF = (await import('utif2')).default;
  const buf = await file.arrayBuffer();
  const pages = UTIF.decode(buf).filter((ifd) => ifd['t256'] !== undefined && !((Number((ifd['t254'] as number[] | undefined)?.[0] ?? 0) & 1)));
  if (pages.length === 0) throw new Error('This TIFF has no image in it.');
  const out: ImageBitmap[] = [];
  for (const ifd of pages.slice(0, maxPages)) {
    UTIF.decodeImage(buf, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    if (!ifd.width || !ifd.height || rgba.length < ifd.width * ifd.height * 4) throw new Error('This TIFF uses an encoding the decoder cannot read.');
    out.push(await createImageBitmap(new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, ifd.width * ifd.height * 4), ifd.width, ifd.height)));
  }
  return out;
}
