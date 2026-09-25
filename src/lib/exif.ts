/**
 * Lossless metadata inspection and removal for JPEG, PNG and WebP, plus EXIF
 * extraction from HEIC/HEIF containers. Nothing here re-encodes pixels.
 */

export interface MetadataSummary {
  /** Kinds of metadata found, e.g. EXIF, XMP, IPTC, ICC, Comment, Text. */
  kinds: string[];
  /** Total bytes of removable metadata. */
  bytes: number;
  hasGps: boolean;
  orientation?: number;
  make?: string;
  model?: string;
  dateTime?: string;
  software?: string;
  hasIcc: boolean;
}

export interface StripOptions {
  /** Keep the ICC color profile. Default true. */
  keepIcc?: boolean;
}

export interface StripResult {
  bytes: Uint8Array;
  summary: MetadataSummary;
}

const td = new TextDecoder('latin1');

function ascii(b: Uint8Array, start: number, len: number): string {
  return td.decode(b.subarray(start, start + len));
}

/* ------------------------------------------------------------------ */
/* TIFF / EXIF parsing                                                 */
/* ------------------------------------------------------------------ */

export interface TiffInfo {
  orientation?: number;
  /** Byte offset of the orientation tag's value inside the TIFF block. */
  orientationValueOffset?: number;
  hasGps: boolean;
  make?: string;
  model?: string;
  dateTime?: string;
  software?: string;
}

/** Parse a TIFF block (the bytes after the "Exif\0\0" prefix). */
export function parseTiff(tiff: Uint8Array): TiffInfo {
  const info: TiffInfo = { hasGps: false };
  if (tiff.length < 8) return info;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  const be = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!le && !be) return info;
  const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o: number) => dv.getUint16(o, le);
  const u32 = (o: number) => dv.getUint32(o, le);
  if (u16(2) !== 42) return info;

  const readAscii = (off: number, count: number): string | undefined => {
    if (count === 0) return undefined;
    const start = count <= 4 ? off + 8 : u32(off + 8);
    if (start + count > tiff.length) return undefined;
    return ascii(tiff, start, count).replace(/\0+$/, '').trim() || undefined;
  };

  const visited = new Set<number>();
  const readIfd = (offset: number, isExifSub: boolean) => {
    if (offset < 8 || offset + 2 > tiff.length || visited.has(offset)) return;
    visited.add(offset);
    const n = u16(offset);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > tiff.length) return;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      switch (tag) {
        case 0x0112:
          if (!isExifSub && type === 3) {
            info.orientation = u16(e + 8);
            info.orientationValueOffset = e + 8;
          }
          break;
        case 0x010f:
          info.make ??= readAscii(e, count);
          break;
        case 0x0110:
          info.model ??= readAscii(e, count);
          break;
        case 0x0131:
          info.software ??= readAscii(e, count);
          break;
        case 0x0132:
          if (!info.dateTime) info.dateTime = readAscii(e, count);
          break;
        case 0x9003: // DateTimeOriginal wins over file modification time
          info.dateTime = readAscii(e, count) ?? info.dateTime;
          break;
        case 0x8769: // Exif IFD pointer
          if (type === 4) readIfd(u32(e + 8), true);
          break;
        case 0x8825: {
          // GPS IFD pointer: count as GPS only if the IFD has coordinates.
          if (type !== 4) break;
          const g = u32(e + 8);
          if (g + 2 <= tiff.length) {
            const gn = u16(g);
            for (let j = 0; j < gn; j++) {
              const ge = g + 2 + j * 12;
              if (ge + 12 > tiff.length) break;
              const gt = u16(ge);
              if (gt === 0x0002 || gt === 0x0004) {
                info.hasGps = true;
                break;
              }
            }
          }
          break;
        }
      }
    }
  };
  readIfd(u32(4), false);
  return info;
}

/** Return a copy of the TIFF block with the orientation tag set to 1 (normal). */
export function withNormalOrientation(tiff: Uint8Array): Uint8Array {
  const info = parseTiff(tiff);
  if (info.orientationValueOffset === undefined) return tiff;
  const out = tiff.slice();
  const le = out[0] === 0x49;
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint16(info.orientationValueOffset, 1, le);
  return out;
}

/* ------------------------------------------------------------------ */
/* JPEG                                                                */
/* ------------------------------------------------------------------ */

interface JpegSegment {
  marker: number;
  start: number; // offset of 0xFF
  end: number; // offset after the segment payload
  payloadStart: number;
  payloadLength: number;
}

function jpegSegments(b: Uint8Array): { segments: JpegSegment[]; scanStart: number } {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw new Error('Not a JPEG file.');
  const segments: JpegSegment[] = [];
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) throw new Error('Corrupt JPEG structure.');
    const marker = b[p + 1]!;
    if (marker === 0xff) {
      p++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      p += 2;
      continue;
    }
    if (marker === 0xda) {
      return { segments, scanStart: p };
    }
    const len = (b[p + 2]! << 8) | b[p + 3]!;
    const seg: JpegSegment = { marker, start: p, end: p + 2 + len, payloadStart: p + 4, payloadLength: len - 2 };
    if (seg.end > b.length) throw new Error('Truncated JPEG file.');
    segments.push(seg);
    p = seg.end;
  }
  throw new Error('No image data found in this JPEG.');
}

function segKind(b: Uint8Array, s: JpegSegment): string | undefined {
  const head = ascii(b, s.payloadStart, Math.min(29, s.payloadLength));
  switch (s.marker) {
    case 0xe1:
      if (head.startsWith('Exif\0')) return 'EXIF';
      if (head.startsWith('http://ns.adobe.com/xap/1.0/') || head.startsWith('http://ns.adobe.com/xmp/extension/')) return 'XMP';
      return 'APP1';
    case 0xe2:
      if (head.startsWith('ICC_PROFILE\0')) return 'ICC';
      if (head.startsWith('MPF\0')) return 'MPF';
      return 'APP2';
    case 0xed:
      return 'IPTC';
    case 0xfe:
      return 'Comment';
    case 0xe0:
      return 'JFIF';
    case 0xee:
      return 'Adobe';
    default:
      if (s.marker >= 0xe3 && s.marker <= 0xef) return `APP${s.marker - 0xe0}`;
      return undefined;
  }
}

/** Extract the TIFF block of the EXIF APP1 segment in a JPEG, if present. */
export function jpegExifTiff(b: Uint8Array): Uint8Array | undefined {
  const { segments } = jpegSegments(b);
  for (const s of segments) {
    if (segKind(b, s) === 'EXIF') return b.subarray(s.payloadStart + 6, s.payloadStart + s.payloadLength);
  }
  return undefined;
}

export function inspectJpeg(b: Uint8Array): MetadataSummary {
  const { segments } = jpegSegments(b);
  const kinds = new Set<string>();
  let bytes = 0;
  let hasIcc = false;
  let tiff: TiffInfo = { hasGps: false };
  for (const s of segments) {
    const kind = segKind(b, s);
    if (!kind || kind === 'JFIF' || kind === 'Adobe') continue;
    if (kind === 'ICC') {
      hasIcc = true;
      continue;
    }
    kinds.add(kind);
    bytes += s.end - s.start;
    if (kind === 'EXIF') tiff = parseTiff(b.subarray(s.payloadStart + 6, s.payloadStart + s.payloadLength));
  }
  return { kinds: [...kinds], bytes, hasIcc, ...tiffSummary(tiff) };
}

function tiffSummary(t: TiffInfo) {
  return { hasGps: t.hasGps, orientation: t.orientation, make: t.make, model: t.model, dateTime: t.dateTime, software: t.software };
}

export function stripJpeg(b: Uint8Array, opts: StripOptions = {}): StripResult {
  const keepIcc = opts.keepIcc ?? true;
  const summary = inspectJpeg(b);
  const { segments, scanStart } = jpegSegments(b);
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let removed = 0;
  for (const s of segments) {
    const kind = segKind(b, s);
    const isMeta = kind !== undefined && kind !== 'JFIF' && kind !== 'Adobe';
    const drop = isMeta && (kind !== 'ICC' || !keepIcc);
    if (drop) {
      removed += s.end - s.start;
      continue;
    }
    parts.push(b.subarray(s.start, s.end));
  }
  parts.push(b.subarray(scanStart));
  if (!keepIcc && summary.hasIcc) summary.kinds.push('ICC');
  summary.bytes = removed;
  return { bytes: concat(parts), summary };
}

/** Build a JPEG with an EXIF APP1 segment inserted right after SOI (and JFIF if present). */
export function jpegWithExif(jpeg: Uint8Array, tiff: Uint8Array): Uint8Array {
  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0], 0);
  payload.set(tiff, 6);
  const len = payload.length + 2;
  if (len > 0xffff) return jpeg; // Too large for one APP1 segment; skip rather than corrupt.
  const header = new Uint8Array([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff]);
  const { segments } = jpegSegments(jpeg);
  // Drop any existing EXIF segment, then insert after JFIF if present.
  const keep = segments.filter((s) => segKind(jpeg, s) !== 'EXIF');
  const parts: Uint8Array[] = [jpeg.subarray(0, 2)];
  let inserted = false;
  for (const s of keep) {
    if (!inserted && segKind(jpeg, s) !== 'JFIF') {
      parts.push(header, payload);
      inserted = true;
    }
    parts.push(jpeg.subarray(s.start, s.end));
  }
  if (!inserted) parts.push(header, payload);
  const last = keep.length ? keep[keep.length - 1]!.end : 2;
  parts.push(jpeg.subarray(last));
  return concat(parts);
}

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_META = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

interface PngChunk {
  type: string;
  start: number;
  end: number;
  dataStart: number;
  length: number;
}

function pngChunks(b: Uint8Array): PngChunk[] {
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) throw new Error('Not a PNG file.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const chunks: PngChunk[] = [];
  let p = 8;
  while (p + 8 <= b.length) {
    const length = dv.getUint32(p);
    const type = ascii(b, p + 4, 4);
    const end = p + 12 + length;
    if (end > b.length) throw new Error('Truncated PNG file.');
    chunks.push({ type, start: p, end, dataStart: p + 8, length });
    p = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

function pngKind(type: string): string {
  return type === 'eXIf' ? 'EXIF' : type === 'tIME' ? 'Time' : 'Text';
}

export function inspectPng(b: Uint8Array): MetadataSummary {
  const chunks = pngChunks(b);
  const kinds = new Set<string>();
  let bytes = 0;
  let tiff: TiffInfo = { hasGps: false };
  let hasIcc = false;
  for (const c of chunks) {
    if (c.type === 'iCCP') hasIcc = true;
    if (!PNG_META.has(c.type)) continue;
    const kind = pngKind(c.type);
    if (c.type === 'iTXt' && ascii(b, c.dataStart, Math.min(17, c.length)).startsWith('XML:com.adobe.xmp')) kinds.add('XMP');
    else kinds.add(kind);
    bytes += c.end - c.start;
    if (c.type === 'eXIf') tiff = parseTiff(b.subarray(c.dataStart, c.dataStart + c.length));
  }
  return { kinds: [...kinds], bytes, hasIcc, ...tiffSummary(tiff) };
}

export function pngExifTiff(b: Uint8Array): Uint8Array | undefined {
  const c = pngChunks(b).find((c) => c.type === 'eXIf');
  return c ? b.subarray(c.dataStart, c.dataStart + c.length) : undefined;
}

export function stripPng(b: Uint8Array, opts: StripOptions = {}): StripResult {
  const keepIcc = opts.keepIcc ?? true;
  const summary = inspectPng(b);
  const chunks = pngChunks(b);
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let removed = 0;
  for (const c of chunks) {
    const drop = PNG_META.has(c.type) || (c.type === 'iCCP' && !keepIcc);
    if (drop) {
      removed += c.end - c.start;
      continue;
    }
    parts.push(b.subarray(c.start, c.end));
  }
  if (!keepIcc && summary.hasIcc) summary.kinds.push('ICC');
  summary.bytes = removed;
  return { bytes: concat(parts), summary };
}

/* ------------------------------------------------------------------ */
/* WebP                                                                */
/* ------------------------------------------------------------------ */

interface RiffChunk {
  fourcc: string;
  start: number;
  end: number; // including padding byte
  dataStart: number;
  length: number;
}

function webpChunks(b: Uint8Array): RiffChunk[] {
  if (b.length < 12 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') throw new Error('Not a WebP file.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const chunks: RiffChunk[] = [];
  let p = 12;
  while (p + 8 <= b.length) {
    const fourcc = ascii(b, p, 4);
    const length = dv.getUint32(p + 4, true);
    const end = p + 8 + length + (length & 1);
    if (p + 8 + length > b.length) throw new Error('Truncated WebP file.');
    chunks.push({ fourcc, start: p, end: Math.min(end, b.length), dataStart: p + 8, length });
    p = end;
  }
  return chunks;
}

export function inspectWebp(b: Uint8Array): MetadataSummary {
  const chunks = webpChunks(b);
  const kinds = new Set<string>();
  let bytes = 0;
  let hasIcc = false;
  let tiff: TiffInfo = { hasGps: false };
  for (const c of chunks) {
    if (c.fourcc === 'ICCP') hasIcc = true;
    if (c.fourcc === 'EXIF') {
      kinds.add('EXIF');
      bytes += c.end - c.start;
      let t = b.subarray(c.dataStart, c.dataStart + c.length);
      if (ascii(t, 0, 4) === 'Exif') t = t.subarray(6);
      tiff = parseTiff(t);
    } else if (c.fourcc === 'XMP ') {
      kinds.add('XMP');
      bytes += c.end - c.start;
    }
  }
  return { kinds: [...kinds], bytes, hasIcc, ...tiffSummary(tiff) };
}

export function webpExifTiff(b: Uint8Array): Uint8Array | undefined {
  const c = webpChunks(b).find((c) => c.fourcc === 'EXIF');
  if (!c) return undefined;
  let t = b.subarray(c.dataStart, c.dataStart + c.length);
  if (ascii(t, 0, 4) === 'Exif') t = t.subarray(6);
  return t;
}

export function stripWebp(b: Uint8Array, opts: StripOptions = {}): StripResult {
  const keepIcc = opts.keepIcc ?? true;
  const summary = inspectWebp(b);
  const chunks = webpChunks(b);
  const body: Uint8Array[] = [];
  let removed = 0;
  for (const c of chunks) {
    const drop = c.fourcc === 'EXIF' || c.fourcc === 'XMP ' || (c.fourcc === 'ICCP' && !keepIcc);
    if (drop) {
      removed += c.end - c.start;
      continue;
    }
    if (c.fourcc === 'VP8X') {
      // Clear the EXIF (0x08), XMP (0x04) and, if dropped, ICC (0x20) flags.
      const chunk = b.slice(c.start, c.end);
      let flags = chunk[8]!;
      flags &= ~0x08 & ~0x04;
      if (!keepIcc) flags &= ~0x20;
      chunk[8] = flags;
      body.push(chunk);
      continue;
    }
    body.push(b.subarray(c.start, c.end));
  }
  const payload = concat(body);
  const header = new Uint8Array(12);
  header.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(header.buffer).setUint32(4, payload.length + 4, true);
  header.set([0x57, 0x45, 0x42, 0x50], 8);
  if (!keepIcc && summary.hasIcc) summary.kinds.push('ICC');
  summary.bytes = removed;
  return { bytes: concat([header, payload]), summary };
}

/* ------------------------------------------------------------------ */
/* HEIF (read-only: pull the EXIF block out of the container)          */
/* ------------------------------------------------------------------ */

export function heifExifTiff(b: Uint8Array): Uint8Array | undefined {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u32 = (o: number) => dv.getUint32(o);
  const u16 = (o: number) => dv.getUint16(o);
  const readN = (o: number, size: number): number => {
    if (size === 0) return 0;
    if (size === 4) return u32(o);
    if (size === 8) return Number(dv.getBigUint64(o));
    return u16(o);
  };

  interface Box {
    type: string;
    start: number;
    end: number;
    body: number;
  }
  const boxesIn = (start: number, end: number): Box[] => {
    const out: Box[] = [];
    let p = start;
    while (p + 8 <= end) {
      let size = u32(p);
      const type = ascii(b, p + 4, 4);
      let body = p + 8;
      if (size === 1) {
        size = Number(dv.getBigUint64(p + 8));
        body = p + 16;
      } else if (size === 0) size = end - p;
      if (size < 8 || p + size > end) break;
      out.push({ type, start: p, end: p + size, body });
      p += size;
    }
    return out;
  };

  const meta = boxesIn(0, b.length).find((x) => x.type === 'meta');
  if (!meta) return undefined;
  const children = boxesIn(meta.body + 4, meta.end); // meta is a FullBox
  const iinf = children.find((x) => x.type === 'iinf');
  const iloc = children.find((x) => x.type === 'iloc');
  const idat = children.find((x) => x.type === 'idat');
  if (!iinf || !iloc) return undefined;

  // Find the item ID whose type is "Exif".
  const iinfVersion = b[iinf.body]!;
  const countSize = iinfVersion === 0 ? 2 : 4;
  const entriesStart = iinf.body + 4 + countSize;
  let exifId: number | undefined;
  for (const infe of boxesIn(entriesStart, iinf.end)) {
    if (infe.type !== 'infe') continue;
    const v = b[infe.body]!;
    if (v < 2) continue;
    const id = v === 2 ? u16(infe.body + 4) : u32(infe.body + 4);
    const itemType = ascii(b, infe.body + (v === 2 ? 8 : 10), 4);
    if (itemType === 'Exif') {
      exifId = id;
      break;
    }
  }
  if (exifId === undefined) return undefined;

  // Locate its data via iloc.
  const version = b[iloc.body]!;
  let p = iloc.body + 4;
  const offsetSize = b[p]! >> 4;
  const lengthSize = b[p]! & 0xf;
  const baseOffsetSize = b[p + 1]! >> 4;
  const indexSize = version === 1 || version === 2 ? b[p + 1]! & 0xf : 0;
  p += 2;
  const itemCount = version < 2 ? u16(p) : u32(p);
  p += version < 2 ? 2 : 4;
  for (let i = 0; i < itemCount; i++) {
    const itemId = version < 2 ? u16(p) : u32(p);
    p += version < 2 ? 2 : 4;
    let construction = 0;
    if (version === 1 || version === 2) {
      construction = u16(p) & 0xf;
      p += 2;
    }
    p += 2; // data_reference_index
    const baseOffset = readN(p, baseOffsetSize);
    p += baseOffsetSize;
    const extentCount = u16(p);
    p += 2;
    const extents: Uint8Array[] = [];
    for (let e = 0; e < extentCount; e++) {
      if (indexSize > 0) p += indexSize;
      const off = readN(p, offsetSize);
      p += offsetSize;
      const len = readN(p, lengthSize);
      p += lengthSize;
      if (itemId === exifId) {
        const abs = construction === 1 ? (idat ? idat.body + baseOffset + off : -1) : baseOffset + off;
        if (abs < 0 || abs + len > b.length) return undefined;
        extents.push(b.subarray(abs, abs + len));
      }
    }
    if (itemId === exifId) {
      const data = concat(extents);
      if (data.length < 4) return undefined;
      const tiffOffset = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
      const tiff = data.subarray(4 + tiffOffset);
      return tiff.length >= 8 ? tiff : undefined;
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

export type MetaFormat = 'jpeg' | 'png' | 'webp' | 'heif' | 'unknown';

export function sniffFormat(b: Uint8Array): MetaFormat {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') return 'heif';
  return 'unknown';
}

export function inspect(b: Uint8Array): MetadataSummary {
  switch (sniffFormat(b)) {
    case 'jpeg':
      return inspectJpeg(b);
    case 'png':
      return inspectPng(b);
    case 'webp':
      return inspectWebp(b);
    case 'heif': {
      const t = heifExifTiff(b);
      const info = t ? parseTiff(t) : { hasGps: false };
      return { kinds: t ? ['EXIF'] : [], bytes: t?.length ?? 0, hasIcc: false, ...tiffSummary(info) };
    }
    default:
      throw new Error('Only JPEG, PNG and WebP files can be cleaned losslessly.');
  }
}

export function strip(b: Uint8Array, opts: StripOptions = {}): StripResult {
  switch (sniffFormat(b)) {
    case 'jpeg':
      return stripJpeg(b, opts);
    case 'png':
      return stripPng(b, opts);
    case 'webp':
      return stripWebp(b, opts);
    default:
      throw new Error('Only JPEG, PNG and WebP files can be cleaned losslessly. Convert HEIC photos first.');
  }
}

/** Get the raw EXIF TIFF block from any supported container. */
export function extractExifTiff(b: Uint8Array): Uint8Array | undefined {
  switch (sniffFormat(b)) {
    case 'jpeg':
      return jpegExifTiff(b);
    case 'png':
      return pngExifTiff(b);
    case 'webp':
      return webpExifTiff(b);
    case 'heif':
      return heifExifTiff(b);
    default:
      return undefined;
  }
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
