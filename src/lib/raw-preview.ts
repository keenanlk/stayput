/**
 * Find the JPEG a camera embeds in a RAW file. This does not develop the RAW: it only locates the preview
 * the camera wrote, so the picture's own bytes can be copied out unchanged. TIFF-based RAWs (CR2, NEF, ARW,
 * DNG) are walked through their IFDs and SubIFDs; CR3 is walked through its ISO-BMFF boxes. Everything is
 * read in ranges, so a 60 MB file is never held in memory whole.
 */

export type Reader = (offset: number, length: number) => Promise<Uint8Array>;

export interface RawPreview {
  /** Where the JPEG's bytes sit in the file. */
  offset: number;
  length: number;
  width: number;
  height: number;
  /** The JPEG itself carries EXIF (the camera's settings, date and so on). */
  hasExif: boolean;
  /** Orientation the JPEG's own EXIF asks for (1 when absent). */
  jpegOrientation: number;
  /** Orientation the RAW file asks for (1 when absent). */
  rawOrientation: number;
}

/** Why a file could not be used; the message is meant for the person who dropped it. */
export class RawError extends Error {}

/** Below this long edge a preview is a thumbnail, not a photo. */
export const MIN_PREVIEW_EDGE = 640;

export const fileReader = (file: Blob): Reader => async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const tag4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
const TRUNCATED = 'This RAW file looks cut short (the download or copy stopped early), so the preview cannot be read from it.';

interface Candidate {
  offset: number;
  length: number;
}

/** Find the JPEG's size from its SOF marker, skipping the segments in front. Only lossy modes count: a lossless SOF3 is RAW data, not a preview. */
async function inspectJpeg(read: Reader, c: Candidate): Promise<Pick<RawPreview, 'width' | 'height' | 'hasExif' | 'jpegOrientation'> | undefined> {
  const head = await read(c.offset, 2);
  if (head[0] !== 0xff || head[1] !== 0xd8) return undefined;
  let pos = 2;
  let hasExif = false;
  let jpegOrientation = 1;
  while (pos + 4 <= c.length) {
    const seg = await read(c.offset + pos, 4);
    if (seg.length < 4 || seg[0] !== 0xff) return undefined;
    const marker = seg[1]!;
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    const len = (seg[2]! << 8) | seg[3]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (marker > 0xc2) return undefined;
      const sof = await read(c.offset + pos + 4, 5);
      if (sof.length < 5) return undefined;
      return { height: (sof[1]! << 8) | sof[2]!, width: (sof[3]! << 8) | sof[4]!, hasExif, jpegOrientation };
    }
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker === 0xe1 && len > 10 && len <= 65535) {
      const body = await read(c.offset + pos + 4, len - 2);
      if (tag4(body, 0) === 'Exif') {
        hasExif = true;
        const tiff = body.subarray(6);
        const found = await tiffOrientation(tiff);
        if (found) jpegOrientation = found;
      }
    }
    pos += 2 + len;
  }
  return undefined;
}

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** The 4 bytes of the value/offset field. */
  at: number;
}

/** A TIFF structure read through `read`; IFD0 is found from the header. Used for the file itself and for in-memory blocks. */
async function walkTiff(read: Reader, size: number, visit: (entries: Entry[], value: (e: Entry) => number) => Promise<number[]>): Promise<void> {
  const head = await read(0, 8);
  const le = head[0] === 0x49;
  const rd16 = (b: Uint8Array, o: number) => (le ? b[o]! | (b[o + 1]! << 8) : (b[o]! << 8) | b[o + 1]!);
  const rd32 = (b: Uint8Array, o: number) => (le ? (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0 : u32(b, o));
  const seen = new Set<number>();
  const queue = [rd32(head, 4)];
  while (queue.length && seen.size < 64) {
    const at = queue.shift()!;
    if (seen.has(at) || at < 8) continue;
    seen.add(at);
    if (at + 2 > size) throw new RawError(TRUNCATED);
    const n = rd16(await read(at, 2), 0);
    if (n === 0 || n > 1000) continue;
    const buf = await read(at + 2, n * 12 + 4);
    if (buf.length < n * 12 + 4) throw new RawError(TRUNCATED);
    const entries: Entry[] = [];
    for (let i = 0; i < n; i++) entries.push({ tag: rd16(buf, i * 12), type: rd16(buf, i * 12 + 2), count: rd32(buf, i * 12 + 4), at: i * 12 + 8 });
    const value = (e: Entry) => (e.type === 3 ? rd16(buf, e.at) : rd32(buf, e.at));
    // The visitor returns offsets of child IFDs to walk; the next IFD in the chain is walked too.
    const children = await visit(entries, value);
    for (const e of entries) {
      if (e.tag === 0x14a && (e.type === 4 || e.type === 13)) {
        if (e.count === 1) children.push(rd32(buf, e.at));
        else if (e.count <= 16) {
          const arr = await read(rd32(buf, e.at), e.count * 4);
          for (let i = 0; i + 4 <= arr.length; i += 4) children.push(rd32(arr, i));
        }
      }
    }
    queue.push(...children, rd32(buf, n * 12 + 2));
  }
}

async function tiffOrientation(tiff: Uint8Array): Promise<number | undefined> {
  if (tiff.length < 8 || !(((tiff[0] === 0x49 && tiff[1] === 0x49) || (tiff[0] === 0x4d && tiff[1] === 0x4d)))) return undefined;
  let found: number | undefined;
  await walkTiff(async (o, l) => tiff.subarray(o, o + l), tiff.length, async (entries, value) => {
    const e = entries.find((x) => x.tag === 0x112);
    if (e && found === undefined) found = value(e);
    return [];
  }).catch(() => undefined);
  return found && found >= 1 && found <= 8 ? found : undefined;
}

async function pickLargest(read: Reader, size: number, candidates: Candidate[], base: Pick<RawPreview, 'rawOrientation'>): Promise<RawPreview | undefined> {
  let best: RawPreview | undefined;
  const tried = new Set<number>();
  let cut = false;
  for (const c of candidates) {
    if (tried.has(c.offset) || c.length < 4) continue;
    tried.add(c.offset);
    if (c.offset + c.length > size) {
      cut = true;
      continue;
    }
    const info = await inspectJpeg(read, c);
    if (info && (!best || info.width * info.height > best.width * best.height)) best = { ...c, ...info, ...base };
  }
  if (!best && cut) throw new RawError(TRUNCATED);
  return best;
}

async function tiffPreview(read: Reader, size: number): Promise<RawPreview | undefined> {
  const candidates: Candidate[] = [];
  let rawOrientation = 1;
  let first = true;
  await walkTiff(read, size, async (entries, value) => {
    const get = (tag: number) => entries.find((e) => e.tag === tag);
    const v = (tag: number) => {
      const e = get(tag);
      return e && e.count === 1 ? value(e) : undefined;
    };
    if (first) {
      const o = v(0x112);
      if (o && o >= 1 && o <= 8) rawOrientation = o;
      first = false;
    }
    const jOff = v(0x201);
    const jLen = v(0x202);
    if (jOff !== undefined && jLen !== undefined) candidates.push({ offset: jOff, length: jLen });
    const comp = v(0x103);
    const sOff = v(0x111);
    const sLen = v(0x117);
    if ((comp === 6 || comp === 7) && sOff !== undefined && sLen !== undefined) candidates.push({ offset: sOff, length: sLen });
    return [];
  });
  return pickLargest(read, size, candidates, { rawOrientation });
}

/** CR3: the PRVW box in Canon's uuid box, and the JPEG tracks in moov whose samples sit in mdat. */
async function cr3Preview(read: Reader, size: number): Promise<RawPreview | undefined> {
  const candidates: Candidate[] = [];
  let rawOrientation = 1;
  let moov: Uint8Array | undefined;
  let pos = 0;
  for (let i = 0; i < 64 && pos + 8 <= size; i++) {
    const h = await read(pos, 8);
    let boxLen = u32(h, 0);
    let hdr = 8;
    if (boxLen === 1) {
      const big = await read(pos + 8, 8);
      boxLen = u32(big, 0) * 2 ** 32 + u32(big, 4);
      hdr = 16;
    } else if (boxLen === 0) boxLen = size - pos;
    if (boxLen < hdr) break;
    const type = tag4(h, 4);
    if (type === 'moov' && boxLen < 8_000_000) moov = await read(pos + hdr, boxLen - hdr);
    if (type === 'uuid' && pos + boxLen <= size) {
      const body = await read(pos + hdr, 48);
      // Canon's preview uuid: 16-byte id, 8 bytes of count, then a PRVW box with a 24-byte header, then the JPEG.
      if (tag4(body, 16 + 8 + 4) === 'PRVW') {
        const jpegLen = u32(body, 44);
        const start = pos + hdr + 16 + 8 + 24;
        candidates.push({ offset: start, length: jpegLen > 0 && start + jpegLen <= pos + boxLen ? jpegLen : pos + boxLen - start });
      }
    }
    pos += boxLen;
  }
  if (moov) {
    const walk = (b: Uint8Array, visit: (type: string, body: Uint8Array) => void) => {
      let o = 0;
      while (o + 8 <= b.length) {
        const len = u32(b, o) || b.length - o;
        if (len < 8) break;
        visit(tag4(b, o + 4), b.subarray(o + 8, o + len));
        o += len;
      }
    };
    walk(moov, (type, body) => {
      if (type !== 'trak') return;
      let offset: number | undefined;
      let sample: number | undefined;
      const down = (b: Uint8Array) =>
        walk(b, (t, inner) => {
          if (t === 'mdia' || t === 'minf' || t === 'stbl') down(inner);
          else if (t === 'stco' && inner.length >= 12) offset = u32(inner, 8);
          else if (t === 'co64' && inner.length >= 16) offset = u32(inner, 8) * 2 ** 32 + u32(inner, 12);
          else if (t === 'stsz' && inner.length >= 12) sample = u32(inner, 4) || (inner.length >= 16 ? u32(inner, 12) : undefined);
        });
      down(body);
      if (offset !== undefined && sample) candidates.push({ offset, length: sample });
    });
    // The orientation sits in a CMT1 box (a TIFF block) inside Canon's moov uuid.
    const at = findBox(moov, 'CMT1');
    if (at) rawOrientation = (await tiffOrientation(at)) ?? 1;
  }
  return pickLargest(read, size, candidates, { rawOrientation });
}

/** The body of the first box called `name` anywhere in `b` (containers are searched by simple scan, which is enough for CMT1). */
function findBox(b: Uint8Array, name: string): Uint8Array | undefined {
  for (let o = 4; o + 8 <= b.length; o++) {
    if (tag4(b, o) === name) {
      const len = u32(b, o - 4);
      if (len >= 8 && o - 4 + len <= b.length) return b.subarray(o + 4, o - 4 + len);
    }
  }
  return undefined;
}

/**
 * The largest JPEG preview in a RAW file, or undefined when the file has none. Throws RawError, with
 * a plain message, for a file that is not a supported RAW or is cut short.
 */
export async function findRawPreview(file: Blob, read: Reader = fileReader(file)): Promise<RawPreview | undefined> {
  const size = file.size;
  const head = await read(0, 12);
  if (head.length < 12) throw new RawError(size === 0 ? 'This file is empty.' : 'This file is too small to be a RAW photo.');
  const isTiff = (head[0] === 0x49 && head[1] === 0x49) || (head[0] === 0x4d && head[1] === 0x4d);
  if (isTiff) {
    const le = head[0] === 0x49;
    const magic = le ? head[2]! | (head[3]! << 8) : (head[2]! << 8) | head[3]!;
    if (magic === 42 || magic === 0x4f52 || magic === 0x5352 || magic === 0x55) return tiffPreview(read, size);
  }
  if (tag4(head, 4) === 'ftyp' && tag4(head, 8) === 'crx ') return cr3Preview(read, size);
  throw new RawError('This does not look like a RAW photo. Drop a Canon CR2 or CR3, Nikon NEF, Sony ARW or DNG file.');
}
