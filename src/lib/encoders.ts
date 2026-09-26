/**
 * Writers for the output formats the canvas API cannot produce. BMP, TIFF
 * and ICO are simple containers written here byte by byte; GIF uses gifenc
 * (MIT) for colour quantisation and LZW. Everything runs in this tab.
 */
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { canvasToBlob, drawScaled, encodeBitmap, fitSize, makeCanvas } from './image';
import { imagesToPdf } from './pdf';
import type { OutputType } from './formats';

export interface WriteOptions {
  /** 0..1 */
  quality: number;
  /** Fill for formats without transparency. */
  background: string;
}

function pixels(bitmap: ImageBitmap, width = bitmap.width, height = bitmap.height, background?: string): ImageData {
  const canvas = drawScaled(bitmap, width, height, background);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  return ctx.getImageData(0, 0, width, height);
}

/** 24-bit bottom-up BMP, the variant every program reads. */
export function writeBmp(img: ImageData): Uint8Array {
  const { width: w, height: h, data } = img;
  const row = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + row * h;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, row * h, true);
  v.setInt32(38, 2835, true); // 72 dpi
  v.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    const dst = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      out[dst + x * 3] = data[s + 2]!;
      out[dst + x * 3 + 1] = data[s + 1]!;
      out[dst + x * 3 + 2] = data[s]!;
    }
  }
  return out;
}

/** Baseline uncompressed RGBA TIFF (little-endian, one strip, unassociated alpha). */
export function writeTiff(img: ImageData): Uint8Array {
  const { width: w, height: h, data } = img;
  const tags: [number, number, number, number | number[]][] = [
    // [tag, type (3 SHORT, 4 LONG, 5 RATIONAL), count, value]
    [256, 4, 1, w],
    [257, 4, 1, h],
    [258, 3, 4, [8, 8, 8, 8]],
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, 0], // strip offset, patched below
    [277, 3, 1, 4],
    [278, 4, 1, h],
    [279, 4, 1, w * h * 4],
    [282, 5, 1, [72, 1]],
    [283, 5, 1, [72, 1]],
    [284, 3, 1, 1],
    [296, 3, 1, 2],
    [338, 3, 1, 2],
  ];
  const ifdSize = 2 + tags.length * 12 + 4;
  let extra = 8 + ifdSize;
  const extraBlocks: { at: number; bytes: number[]; type: number }[] = [];
  const entries = tags.map(([tag, type, count, value]) => {
    const vals = Array.isArray(value) ? value : [value];
    const bytes = type === 3 ? 2 * count : type === 4 ? 4 * count : 8 * count;
    if (bytes <= 4) return { tag, type, count, inline: vals };
    const at = extra;
    extra += bytes;
    extraBlocks.push({ at, bytes: vals, type });
    return { tag, type, count, offset: at };
  });
  const dataOffset = extra;
  const out = new Uint8Array(dataOffset + w * h * 4);
  const v = new DataView(out.buffer);
  out.set([0x49, 0x49, 42, 0]);
  v.setUint32(4, 8, true);
  v.setUint16(8, entries.length, true);
  entries.forEach((e, i) => {
    const p = 10 + i * 12;
    v.setUint16(p, e.tag, true);
    v.setUint16(p + 2, e.type, true);
    v.setUint32(p + 4, e.count, true);
    if ('offset' in e) v.setUint32(p + 8, e.offset!, true);
    else if (e.tag === 273) v.setUint32(p + 8, dataOffset, true);
    else if (e.type === 3) e.inline!.forEach((x, j) => v.setUint16(p + 8 + j * 2, x, true));
    else v.setUint32(p + 8, e.inline![0]!, true);
  });
  v.setUint32(10 + entries.length * 12, 0, true);
  for (const b of extraBlocks) {
    b.bytes.forEach((x, j) => (b.type === 3 ? v.setUint16(b.at + j * 2, x, true) : v.setUint32(b.at + j * 4, x, true)));
  }
  out.set(data, dataOffset);
  return out;
}

export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Multi-size ICO with PNG entries (Windows Vista and later, every browser). The image is centred on a transparent square. */
export async function writeIco(bitmap: ImageBitmap): Promise<Uint8Array> {
  const largest = Math.max(bitmap.width, bitmap.height);
  const sizes = ICO_SIZES.filter((s) => s <= Math.max(16, largest));
  const pngs: Uint8Array[] = [];
  for (const s of sizes) {
    const fit = fitSize(bitmap.width, bitmap.height, { maxWidth: s, maxHeight: s, scale: largest < s ? s / largest : 1 });
    const inner = drawScaled(bitmap, Math.min(s, fit.width), Math.min(s, fit.height));
    const square = makeCanvas(s, s);
    (square.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).drawImage(inner, Math.floor((s - inner.width) / 2), Math.floor((s - inner.height) / 2));
    pngs.push(new Uint8Array(await (await canvasToBlob(square, 'image/png')).arrayBuffer()));
  }
  const header = 6 + 16 * pngs.length;
  const out = new Uint8Array(header + pngs.reduce((n, p) => n + p.length, 0));
  const v = new DataView(out.buffer);
  v.setUint16(2, 1, true);
  v.setUint16(4, pngs.length, true);
  let offset = header;
  pngs.forEach((png, i) => {
    const p = 6 + i * 16;
    const s = sizes[i]!;
    out[p] = s >= 256 ? 0 : s;
    out[p + 1] = s >= 256 ? 0 : s;
    v.setUint16(p + 4, 1, true);
    v.setUint16(p + 6, 32, true);
    v.setUint32(p + 8, png.length, true);
    v.setUint32(p + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}

/** Single-frame GIF, 256 colours; pixels under half opacity become transparent. */
export function writeGif(img: ImageData): Uint8Array {
  const rgba = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
  const index = applyPalette(rgba, palette, 'rgba4444');
  const transparentIndex = palette.findIndex((c) => c[3] === 0);
  const gif = GIFEncoder();
  gif.writeFrame(index, img.width, img.height, { palette, transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex) });
  gif.finish();
  return gif.bytes();
}

/** Encode a decoded image into any output format. */
export async function writeImage(bitmap: ImageBitmap, type: OutputType, opts: WriteOptions): Promise<Blob> {
  const blob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type });
  switch (type) {
    case 'image/jpeg':
    case 'image/png':
    case 'image/webp':
      return encodeBitmap(bitmap, { type, quality: opts.quality, background: opts.background });
    case 'image/bmp':
      return blob(writeBmp(pixels(bitmap, undefined, undefined, opts.background)));
    case 'image/tiff':
      return blob(writeTiff(pixels(bitmap)));
    case 'image/gif':
      return blob(writeGif(pixels(bitmap)));
    case 'image/x-icon':
      return blob(await writeIco(bitmap));
    case 'application/pdf': {
      const jpg = await encodeBitmap(bitmap, { type: 'image/jpeg', quality: opts.quality, background: opts.background });
      const bytes = await imagesToPdf([{ kind: 'jpg', bytes: new Uint8Array(await jpg.arrayBuffer()) }], { pageSize: 'fit', orientation: 'auto', margin: 0 });
      return blob(bytes);
    }
  }
}
