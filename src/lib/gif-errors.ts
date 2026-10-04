/**
 * What can go wrong when compressing a GIF, each with its own error name (the
 * short kind a failed run records; the message is never sent) and a message
 * that says what to try next. Used by the Compress GIF tool only.
 */

class GifError extends Error {
  constructor(name: string, message: string) {
    super(message);
    // Set by hand: a minified class name would not survive into the name.
    this.name = name;
  }
}

export class NotAGif extends GifError {
  constructor(found?: string) {
    const next = found === 'a video' ? 'Use Compress video for a video, or save' : found ? 'Use Compress & Resize Images for a picture, or save' : 'Save';
    super('NotAGif', `This file is not a GIF.${found ? ` It looks like ${found}.` : ''} Some apps save GIFs as WebP or video under a .gif name. ${next} the GIF again from the original app.`);
  }
}

export class DamagedGif extends GifError {
  constructor() {
    super('DamagedGif', 'This GIF could not be read. It may be damaged or cut short: download or save it again, then try once more.');
  }
}

export class GifTooLarge extends GifError {
  constructor() {
    super('GifTooLarge', "This GIF is too large for this device's memory. Try a desktop browser, or set Size to 50% and Frames to \"Drop every second frame\" and run it again.");
  }
}

export class UnreadableFile extends GifError {
  constructor() {
    super('UnreadableFile', "This device couldn't read the file. If it is in a cloud folder or still downloading, save it to the device first and add it again.");
  }
}

/** Bytes held while compressing: every kept frame is stored whole as RGBA. Above this, phones and tablets run out of memory. */
export const MEMORY_BUDGET = 2 ** 30;

/** What a file that is not a GIF seems to be, from its first bytes. */
export function sniff(b: Uint8Array): string | undefined {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'a WebP image';
  if (ascii(4, 8) === 'ftyp' || ascii(0, 4) === '\x1aE\xdf\xa3') return 'a video';
  if (ascii(1, 4) === 'PNG') return 'a PNG image';
  if (b[0] === 0xff && b[1] === 0xd8) return 'a JPEG image';
  return undefined;
}

/** The logical screen size of a GIF, from its header; undefined when the header is too short. */
export function gifSize(b: Uint8Array): { width: number; height: number } | undefined {
  if (b.length < 10) return undefined;
  return { width: b[6]! | (b[7]! << 8), height: b[8]! | (b[9]! << 8) };
}

/** Throws the error to show before any work starts: not a GIF, or too big to hold. `frames` is the count after any frames are dropped. */
export function checkGif(bytes: Uint8Array, frames: (() => number) | undefined, scale: number, keepEvery: number): void {
  if (String.fromCharCode(...bytes.subarray(0, 3)) !== 'GIF') throw new NotAGif(sniff(bytes));
  const size = gifSize(bytes);
  if (!size) throw new DamagedGif();
  if (!frames) return;
  const k = Math.min(1, Math.max(0.05, scale));
  const kept = Math.ceil(frames() / Math.max(1, Math.round(keepEvery)));
  if (size.width * k * size.height * k * 4 * kept > MEMORY_BUDGET) throw new GifTooLarge();
}

/** The error a failure while compressing should be shown as: out-of-memory kinds become GifTooLarge, anything else is passed on. */
export function explain(e: unknown): unknown {
  if (e instanceof GifError) return e;
  const msg = e instanceof Error ? e.message : '';
  if (e instanceof RangeError || (e instanceof DOMException && e.name === 'QuotaExceededError') || /memory|array length|allocation/i.test(msg)) return new GifTooLarge();
  // getContext() returns nothing when a canvas is bigger than the device allows.
  if (e instanceof TypeError && /null/.test(msg)) return new GifTooLarge();
  if (msg === 'This GIF has no frames.') return new DamagedGif();
  return e;
}
