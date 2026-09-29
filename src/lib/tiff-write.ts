/**
 * A small TIFF writer: 8-bit RGB pages, each stored as one Deflate-compressed
 * strip (compression 8, the zlib stream fflate writes), chained into a single
 * multi-page file the way scanners and fax software expect. Pillow,
 * Preview, Photoshop, Windows Photos and libtiff all read it.
 */
import { zlibSync } from 'fflate';

export interface TiffPage {
  width: number;
  height: number;
  dpi: number;
  /** The page's RGB pixels, already Deflate-compressed, so a long document is not held uncompressed in memory. */
  strip: Uint8Array;
}

/** Compress one page's RGBA pixels (as from getImageData) into a TIFF strip. Alpha is dropped; pages are opaque. */
export function tiffPage(rgba: Uint8ClampedArray, width: number, height: number, dpi: number): TiffPage {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]!;
    rgb[j + 1] = rgba[i + 1]!;
    rgb[j + 2] = rgba[i + 2]!;
  }
  return { width, height, dpi, strip: zlibSync(rgb, { level: 6 }) };
}

const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

export function writeTiff(pages: TiffPage[]): Uint8Array {
  const strips = pages.map((p) => p.strip);
  const TAGS = 13;
  // Per page: IFD (2 + 12 * tags + 4), BitsPerSample values (6), two rationals (16), then the strip.
  const ifdSize = 2 + 12 * TAGS + 4;
  const extra = 6 + 16;
  let size = 8;
  for (const s of strips) size += ifdSize + extra + s.length + (s.length & 1);
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  out.set([0x49, 0x49]); // "II": little-endian
  v.setUint16(2, 42, true);
  let o = 8;
  v.setUint32(4, o, true);
  pages.forEach((p, n) => {
    const strip = strips[n]!;
    const ifd = o;
    const bits = ifd + ifdSize;
    const xres = bits + 6;
    const yres = xres + 8;
    const data = yres + 8;
    const next = data + strip.length + (strip.length & 1);
    const entries: [number, number, number, number][] = [
      [256, LONG, 1, p.width],
      [257, LONG, 1, p.height],
      [258, SHORT, 3, bits],
      [259, SHORT, 1, 8], // Deflate
      [262, SHORT, 1, 2], // RGB
      [273, LONG, 1, data],
      [277, SHORT, 1, 3],
      [278, LONG, 1, p.height],
      [279, LONG, 1, strip.length],
      [282, RATIONAL, 1, xres],
      [283, RATIONAL, 1, yres],
      [284, SHORT, 1, 1], // chunky
      [296, SHORT, 1, 2], // inches
    ];
    v.setUint16(ifd, entries.length, true);
    entries.forEach(([tag, type, count, value], i) => {
      const e = ifd + 2 + i * 12;
      v.setUint16(e, tag, true);
      v.setUint16(e + 2, type, true);
      v.setUint32(e + 4, count, true);
      if (type === SHORT && count === 1) v.setUint16(e + 8, value, true);
      else v.setUint32(e + 8, value, true);
    });
    v.setUint32(ifd + 2 + entries.length * 12, n === pages.length - 1 ? 0 : next, true);
    for (let i = 0; i < 3; i++) v.setUint16(bits + i * 2, 8, true);
    v.setUint32(xres, Math.round(p.dpi), true);
    v.setUint32(xres + 4, 1, true);
    v.setUint32(yres, Math.round(p.dpi), true);
    v.setUint32(yres + 4, 1, true);
    out.set(strip, data);
    o = next;
  });
  return out;
}
