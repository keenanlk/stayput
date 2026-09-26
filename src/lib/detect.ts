/**
 * Work out what an image really is from its first bytes, not its name. A
 * photo called IMG_0042.jpg can be a HEIC, and a download called image.png
 * can be a WebP; the converter shows the real format and decodes accordingly.
 */

export type ImageKind = 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'ico' | 'tiff' | 'heic' | 'avif' | 'jxl' | 'svg' | 'pdf';

export const KIND_LABEL: Record<ImageKind, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WebP',
  bmp: 'BMP',
  ico: 'ICO',
  tiff: 'TIFF',
  heic: 'HEIC',
  avif: 'AVIF',
  jxl: 'JPEG XL',
  svg: 'SVG',
  pdf: 'PDF',
};

/** How many leading bytes `sniffKind` wants. SVG may start with a long XML prologue or comment. */
export const SNIFF_BYTES = 1024;

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** Identify an image from its leading bytes. Undefined when the signature is unknown. */
export function sniffKind(b: Uint8Array): ImageKind | undefined {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return 'png';
  if (b.length >= 6 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')) return 'gif';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp';
  if (b.length >= 2 && ascii(b, 0, 2) === 'BM') return 'bmp';
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && (b[2] === 1 || b[2] === 2) && b[3] === 0) return 'ico';
  if (b.length >= 4 && ((ascii(b, 0, 2) === 'II' && b[2] === 42 && b[3] === 0) || (ascii(b, 0, 2) === 'MM' && b[2] === 0 && b[3] === 42))) return 'tiff';
  if (b.length >= 5 && ascii(b, 0, 5) === '%PDF-') return 'pdf';
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0x0a) return 'jxl';
  if (b.length >= 12 && b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 0x0c && ascii(b, 4, 8) === 'JXL ') return 'jxl';
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp') {
    const brands = [ascii(b, 8, 12)];
    const size = (b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!;
    for (let i = 16; i + 4 <= Math.min(size, b.length); i += 4) brands.push(ascii(b, i, i + 4));
    // The major brand decides; compatible brands break ties for files like "mif1" + "heic".
    const major = brands[0]!;
    if (major === 'avif' || major === 'avis') return 'avif';
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx'].includes(major)) return 'heic';
    if (brands.includes('avif') || brands.includes('avis')) return 'avif';
    if (brands.some((x) => ['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1'].includes(x))) return 'heic';
    return undefined;
  }
  // SVG is text: skip a byte-order mark, whitespace, an XML declaration, comments and a doctype.
  const text = new TextDecoder().decode(b).replace(/^﻿/, '');
  const rest = text.replace(/^(\s|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i, '');
  if (/^<svg[\s>]/i.test(rest)) return 'svg';
  return undefined;
}

/** Best guess from the file name and browser-reported type, used only when the bytes say nothing. */
export function kindFromName(name: string, type: string): ImageKind | undefined {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  const byExt: Record<string, ImageKind> = {
    jpg: 'jpeg', jpeg: 'jpeg', jfif: 'jpeg', jpe: 'jpeg', pjpeg: 'jpeg', png: 'png', apng: 'png', gif: 'gif', webp: 'webp',
    bmp: 'bmp', dib: 'bmp', ico: 'ico', cur: 'ico', tif: 'tiff', tiff: 'tiff', heic: 'heic', heif: 'heic', hif: 'heic',
    avif: 'avif', jxl: 'jxl', svg: 'svg', pdf: 'pdf',
  };
  if (byExt[ext]) return byExt[ext];
  const sub = type.replace(/^image\//, '').replace(/^x-/, '');
  return byExt[sub] ?? (sub === 'svg+xml' ? 'svg' : sub === 'vnd.microsoft.icon' ? 'ico' : undefined);
}

/** Detect a file's real image format: signature first, then name and type. */
export async function detectKind(file: Blob & { name?: string }): Promise<ImageKind | undefined> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  return sniffKind(head) ?? kindFromName(file.name ?? '', file.type);
}
