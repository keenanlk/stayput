/**
 * Why the video reader found no container in a file. Mediabunny's getFormat() returns null for several unlike causes: the
 * first bytes could not be read (a short or empty read from a content-provider file on Android), the file is a video the
 * reader refuses despite a known signature, a video in a format the page does not read at all, or a file that is not a video.
 * This looks at the first 64 KB itself and gives each cause its own name, which is all a failed run records.
 * Kept free of browser and codec imports (mediabunny is loaded only by the one retry) so a spec can drive it directly.
 */
import { NamedError } from './input-error';
import { isFileGone, isNotReadable, notReadable } from './read-failure';

/** How much of the start of the file is looked at. */
export const HEAD_BYTES = 65536;

export type Signature = 'mp4' | 'matroska' | 'ts' | 'other-video';

const ascii = (b: Uint8Array, at: number, text: string): boolean => text.length + at <= b.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const MP4_BOXES = ['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'pnot'];

/** Every 188th (or 192nd, for M2TS) byte from `from` is the 0x47 sync byte, at least twice. */
function transportStream(b: Uint8Array, from: number, stride: number): boolean {
  let hits = 0;
  let at = from;
  for (; at < b.length; at += stride) {
    if (b[at] !== 0x47) return false;
    hits++;
  }
  return hits >= 2;
}

/** What kind of video container the first bytes look like, or null when they look like nothing a video starts with. */
export function videoSignature(b: Uint8Array): Signature | null {
  if (b.length >= 8 && MP4_BOXES.some((box) => ascii(b, 4, box))) return 'mp4';
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'matroska';
  if (transportStream(b, 0, 188) || transportStream(b, 4, 192)) return 'ts';
  // Video formats other than the ones this page reads: AVI, ASF (WMV), FLV, MPEG program stream.
  if ((ascii(b, 0, 'RIFF') && ascii(b, 8, 'AVI ')) || ascii(b, 0, 'FLV\x01')) return 'other-video';
  if (b.length >= 16 && [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11].every((v, i) => b[i] === v)) return 'other-video';
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0xba) return 'other-video';
  return null;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The first bytes, read up to twice. Throws the named cause when they cannot be had. */
async function readHead(file: Blob, wait: number): Promise<Uint8Array> {
  const want = Math.min(file.size, HEAD_BYTES);
  let gone = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await pause(wait);
    try {
      const bytes = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
      if (want > 0 && bytes.length >= want) return bytes;
    } catch (e) {
      if (isNotReadable(e) || isFileGone(e)) gone = true;
    }
  }
  if (gone) return Promise.reject(new NamedError('UnreadableFileGone', 'This file could not be read. It may have been moved, deleted or still be syncing from a cloud app. Pick it again, or save it to the phone first.'));
  return Promise.reject(new NamedError('UnreadableHeaderShort', 'The start of this file could not be read in full, so this page cannot tell what it is. Pick it again, or save it to the phone first and pick the saved copy.'));
}

/** Whether a fresh reader over the same file finds a container this time. */
async function detectsNow(file: Blob): Promise<boolean> {
  try {
    const { BlobSource, Input, MATROSKA, MP4, MPEG_TS, QTFF, WEBM } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA, MPEG_TS] });
    try {
      return !!(await input.getFormat());
    } finally {
      input.dispose?.();
    }
  } catch {
    return false;
  }
}

/**
 * The error for a file in which the reader found no container (getFormat() was null):
 * - UnreadableFileGone / UnreadableHeaderShort: the first bytes would not read in full, even a second time;
 * - NotReadableError (stage probe): the bytes look like a video and a fresh reader now opens it, so the first read was bad
 *   and the job reads the file once more (the same rule as any other read the phone failed);
 * - ContainerParseFailed: a known video signature that the reader refuses on every try;
 * - ContainerNotSupported: a video, but in a format this page does not read (AVI, WMV, FLV, MPEG);
 * - NotAVideoContainer: nothing a video starts with.
 */
export async function explainNoContainer(file: Blob, wait = 400, detect: (f: Blob) => Promise<boolean> = detectsNow): Promise<Error> {
  let head: Uint8Array;
  try {
    head = await readHead(file, wait);
  } catch (e) {
    return e as Error;
  }
  const kind = videoSignature(head);
  if (kind === 'other-video') return new NamedError('ContainerNotSupported', 'This looks like a video in a format this page cannot read (such as AVI, WMV, FLV or MPEG). Make an MP4 copy first, then pick that.');
  if (kind) {
    if (await detect(file)) return notReadable(new NamedError('ContainerReadRetry', 'The first read of the file did not match the second.'), 'probe');
    return new NamedError('ContainerParseFailed', 'This looks like a video, but this page could not read how it is laid out. The file may be damaged or cut short. Make an MP4 copy first, then pick that.');
  }
  return new NamedError('NotAVideoContainer', 'This file is not a video this page can read (MP4, MOV, WebM or MKV).');
}
