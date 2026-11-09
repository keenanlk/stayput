/**
 * The picture side of remove-background (and nothing else): opening a photo, telling apart why one cannot be opened,
 * and drawing and saving the result at a size this device can manage. `decodeImage` and `canvasToBlob` in image.ts are
 * shared with every image tool and the scanner pages, so they are left as they are and wrapped here.
 */
import { canvasToBlob, decodeImageRaw, loadWebpEncoder, type Decoded, type EncodeType } from './image';
import { IOS_CANVAS_PIXELS } from './canvas-cap';
import { isIosBrowser } from './phone-limit';
import { NamedError } from './input-error';
import { readHead } from './files';

export type PictureKind = 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'other';

/** What a file's first bytes say it is, whatever its name says. */
export function kindOfHead(head: Uint8Array): PictureKind {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (ascii(0, 3) === 'GIF') return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 2) === 'BM') return 'bmp';
  return 'other';
}

/**
 * A JPEG whose picture data stops before its end marker was cut off (a download that stopped, a card pulled early).
 * Bytes after the end marker do not count: motion photos carry a video there, and some cameras add a long trailer. So
 * the segments are walked from the start, through every scan, and the file is whole once an end marker (FF D9) is
 * reached; a stray FF D9 inside an embedded EXIF thumbnail is skipped with its segment.
 */
export async function jpegIsCutOff(file: Blob): Promise<boolean> {
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 64)).arrayBuffer());
  for (let i = tail.length - 2; i >= 0; i--) if (tail[i] === 0xff && tail[i + 1] === 0xd9) return false;
  return !jpegReachesEnd(new Uint8Array(await file.arrayBuffer()));
}

function jpegReachesEnd(b: Uint8Array): boolean {
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return false;
    const marker = b[i + 1]!;
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd9) return true;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; }
    if (i + 3 >= b.length) return false;
    i += 2 + ((b[i + 2]! << 8) | b[i + 3]!);
    if (marker !== 0xda) continue;
    // Scan data: runs until the next marker (FF followed by something other than 00 or a restart marker).
    for (;;) {
      i = b.indexOf(0xff, i);
      if (i < 0 || i + 1 >= b.length) return false;
      const next = b[i + 1]!;
      if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break;
      i += 2;
    }
  }
  return false;
}

/** Width and height from a PNG or JPEG header, or undefined when it cannot be read. */
export async function headerSize(file: Blob): Promise<{ width: number; height: number } | undefined> {
  const head = new Uint8Array(await file.slice(0, 1 << 16).arrayBuffer());
  const kind = kindOfHead(head);
  const view = new DataView(head.buffer);
  if (kind === 'png' && head.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (kind === 'jpeg') {
    let i = 2;
    while (i + 9 < head.length) {
      if (head[i] !== 0xff) return undefined;
      const marker = head[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      i += 2 + view.getUint16(i + 2);
    }
  }
  return undefined;
}

/** Pixels beyond which an unusually big picture is opened at a reduced size when it will not open whole. */
const REDUCED_PIXELS = 48_000_000;

/**
 * Opens a photo. A file that will not open is named by what it is: not a picture at all (NotAPicture), or a picture
 * that is damaged (PictureDamaged). A picture too big to open whole is opened at a reduced size instead (the browser
 * scales it while reading, so the full-size picture is never held); only when that fails too is it OutOfMemoryError.
 */
export async function openPicture(file: File): Promise<Decoded & { reducedFrom?: { width: number; height: number } }> {
  try {
    return await decodeImageRaw(file);
  } catch (e) {
    if (e instanceof Error && e.name === 'OutOfMemoryError') {
      const size = await headerSize(file).catch(() => undefined);
      if (size && size.width * size.height > REDUCED_PIXELS) {
        const k = Math.sqrt(REDUCED_PIXELS / (size.width * size.height));
        const w = Math.max(1, Math.floor(size.width * k));
        const h = Math.max(1, Math.floor(size.height * k));
        try {
          const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
          return { bitmap, width: bitmap.width, height: bitmap.height, heic: false, reducedFrom: size };
        } catch {
          // Still too big: the original refusal, in plain words, stands.
        }
      }
      throw e;
    }
    if (!(e instanceof Error) || e.name !== 'ImageFailed') throw e;
    const kind = kindOfHead(await readHead(file, 16));
    if (kind === 'other') throw new NamedError('NotAPicture', "This file isn't a picture this page can read. Choose a JPG, PNG, WebP, HEIC or similar photo.", { cause: e });
    throw new NamedError('PictureDamaged', "This picture looks damaged or cut off, so it can't be read. Save or export it again from the original, or try another copy.", { cause: e });
  }
}

/** The largest scale at which a picture of this size is drawn on this device: Safari on iPhone caps one canvas at 16.7 million pixels. */
export function startScale(width: number, height: number, ios = isIosBrowser()): number {
  return ios && width * height > IOS_CANVAS_PIXELS ? Math.sqrt(IOS_CANVAS_PIXELS / (width * height)) * 0.99 : 1;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Whether this browser's canvas writes WebP itself (Safari's does not). */
async function writesWebp(): Promise<boolean> {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/webp'));
  return blob?.type === 'image/webp';
}

/** The WebAssembly WebP encoder, asked for three times (a flaky connection drops the first fetch); EncoderLoadFailed when it never arrives. */
export async function warmWebpEncoder(wait: (ms: number) => Promise<void> = sleep): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await wait(attempt * 1000);
    try {
      await loadWebpEncoder();
      return;
    } catch (e) {
      last = e;
    }
  }
  throw new NamedError('EncoderLoadFailed', 'The WebP saver could not be loaded. Check your connection and try again, or choose PNG.', { cause: last });
}

export interface Rendered {
  blob: Blob;
  /** What was saved, for a preview. */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  /** True when the result is smaller than the photo because this device could not draw or save it whole. */
  scaled: boolean;
}

const LADDER = [1, 0.7, 0.5];

/**
 * Draws the result with `render` and saves it. When the device cannot draw or save a picture this big (no canvas, a
 * canvas that reads back blank, a save that returns nothing), the photo is scaled down to 70% and then 50% and tried
 * again; only when that fails too is it PictureTooBig. Nothing that is not about size is retried.
 */
export async function renderAndSave(
  bitmap: ImageBitmap,
  render: (source: ImageBitmap) => HTMLCanvasElement | OffscreenCanvas,
  type: EncodeType,
  quality?: number,
  opts: { ios?: boolean; wait?: (ms: number) => Promise<void> } = {},
): Promise<Rendered> {
  if (type === 'image/webp' && !(await writesWebp())) await warmWebpEncoder(opts.wait);
  const first = startScale(bitmap.width, bitmap.height, opts.ios);
  let cause: unknown;
  for (const step of LADDER) {
    const scale = first * step;
    let source = bitmap;
    let own: ImageBitmap | undefined;
    try {
      if (scale < 1) {
        own = await createImageBitmap(bitmap, { resizeWidth: Math.max(1, Math.floor(bitmap.width * scale)), resizeHeight: Math.max(1, Math.floor(bitmap.height * scale)), resizeQuality: 'high' });
        source = own;
      }
      const canvas = render(source);
      const blob = await canvasToBlob(canvas, type, quality);
      return { blob, canvas, width: source.width, height: source.height, scaled: scale < 1 };
    } catch (e) {
      // A mask or a model failure is not about size; a canvas that would not draw or a save that came back empty is.
      const sizeRelated = e instanceof Error && (e.name === 'ImageFailed' || e.name === 'TypeError' || e.name === 'RangeError' || e.name === 'OutOfMemoryError' || e.name === 'CanvasMemoryError' || e.name === 'EncodingError');
      if (!sizeRelated) throw e;
      cause = e;
    } finally {
      own?.close();
    }
  }
  throw new NamedError('PictureTooBig', 'This picture is too big for this device to draw and save, even at half its size. Try a smaller copy of it, or use a computer.', { cause });
}
