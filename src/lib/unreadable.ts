/**
 * Why a file that a tool could not open could not be opened, told apart by looking at the file itself (its size, its first
 * bytes and, for a few formats, its last): an empty file, a file of another type, a file cut short, or a file whose start is
 * right but which this browser's decoder refused. Each cause is a class name of its own, which is all a failed run records.
 * Kept free of browser and codec imports (only `sniff` and `container-sniff`'s head reader) so a spec can drive it directly.
 * The sentences live in one table, COPY, so the wording can be changed in one place.
 */
import { NamedError } from './input-error';
import { readHead } from './container-sniff';
import { kindOf, sniffBytes, SNIFF_BYTES, type Container } from './sniff';

export type Family = 'image' | 'gif' | 'pdf' | 'archive';

/** The user-facing sentences. `{type}` is replaced with what the file really is ("a PDF", "a video"). */
export const COPY = {
  EmptyFile: 'This file is empty (0 bytes). Pick it again, or check that it finished saving or downloading.',
  NotAnImageFile: 'This file is {type}, not a picture. Pick a PNG, JPG, WebP, GIF or HEIC.',
  NotAPdfFile: 'This file is {type}, not a PDF. Pick a PDF.',
  NotAnArchiveFile: 'This file is {type}, not an archive this tool opens (ZIP, 7z, RAR, TAR).',
  NotAGifFile: 'This file is {type}, not a GIF. Pick a GIF.',
  FileTruncated: 'This file looks cut short, so it cannot be read in full. Download or copy it again, then pick the new copy.',
  ImageDecodeFailed: 'This browser could not open this picture, although it is {type}. Save it again as a PNG or JPG, or try another browser.',
  PdfNoPages: 'This PDF has no pages this tool can find, so it may be damaged. Open it in a PDF viewer, save a copy, and pick that.',
} as const;

const WRONG_TYPE: Record<Family, keyof typeof COPY> = { image: 'NotAnImageFile', gif: 'NotAGifFile', pdf: 'NotAPdfFile', archive: 'NotAnArchiveFile' };

/** What each container is called in a sentence. */
const LABEL: Partial<Record<Container, string>> = {
  mp4: 'a video', mov: 'a video', '3gp': 'a video', webm: 'a video', mkv: 'a video', mpegts: 'a video', avi: 'a video', flv: 'a video', asf: 'a video',
  m4a: 'a sound file', ogg: 'a sound file', mp3: 'a sound file', aac: 'a sound file', wav: 'a sound file', flac: 'a sound file', aiff: 'a sound file', caf: 'a sound file', amr: 'a sound file', midi: 'a MIDI file',
  jpeg: 'a JPG picture', png: 'a PNG picture', gif: 'a GIF', webp: 'a WebP picture', bmp: 'a BMP picture', tiff: 'a TIFF picture', heic: 'a HEIC picture', avif: 'an AVIF picture',
  pdf: 'a PDF', zip: 'a ZIP archive',
};

export const copy = (name: keyof typeof COPY, type = 'another type of file') => COPY[name].replace('{type}', type);
export const labelOf = (c: Container): string => LABEL[c] ?? (c === 'unknown' ? 'text or another kind of file' : 'another type of file');

/** Whether a container is one the family's tools can open. */
export function fits(family: Family, c: Container): boolean {
  switch (family) {
    case 'image': return kindOf(c) === 'image' || c === 'unknown';
    case 'gif': return c === 'gif';
    case 'pdf': return c === 'pdf' || c === 'unknown';
    // Archives other than ZIP (7z, RAR, TAR, gzip) have no signature in sniff, so 'unknown' passes; only a file known to be something else is refused.
    case 'archive': return c === 'zip' || c === 'unknown';
  }
}

/**
 * The refusal for a file that is plainly the wrong thing for this family, or null when the file may go ahead.
 * `size` 0 is EmptyFile. Only looks at what is already read, so intake can call it with the head it has.
 */
export function wrongThing(family: Family, head: Uint8Array, size: number): NamedError | null {
  if (size === 0) return new NamedError('EmptyFile', COPY.EmptyFile);
  const c = sniffBytes(head.subarray(0, SNIFF_BYTES));
  if (c === 'zeros' || fits(family, c)) {
    // Text is not a picture either: a file with a text start that no family signature explains (unknown) is judged by the decoder.
    return null;
  }
  const name = WRONG_TYPE[family];
  return new NamedError(name, copy(name, labelOf(c)));
}

const PNG_END = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

/** Whether the end of the file is where its format says it ends. Only formats that mark an end: JPEG (FFD9), PNG (IEND), GIF (3B), PDF (%%EOF), ZIP (end record). */
export function looksCutShort(c: Container, tail: Uint8Array): boolean {
  const has = (sig: number[]) => {
    for (let i = 0; i + sig.length <= tail.length; i++) if (sig.every((v, j) => tail[i + j] === v)) return true;
    return false;
  };
  switch (c) {
    case 'jpeg': return !has([0xff, 0xd9]);
    case 'png': return !has(PNG_END);
    case 'gif': return tail.length === 0 || tail[tail.length - 1] !== 0x3b;
    case 'pdf': return !has([0x25, 0x25, 0x45, 0x4f, 0x46]);
    case 'zip': return !has([0x50, 0x4b, 0x05, 0x06]);
    default: return false;
  }
}

/** Last 1 KB (4 KB for a ZIP's end record, which can trail a comment). */
async function readTail(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(Math.max(0, file.size - 4096)).arrayBuffer());
}

/**
 * The named cause for a file the tool tried and failed to open. Order: unreadable bytes (UnreadableFileGone / UnreadableHeaderShort,
 * after one re-read), an empty file, a file of another type, a file cut short, and otherwise `fallback` (a decoder that failed on a
 * start that was right). `fallback` is the class to use for that last case.
 */
export async function explainUnreadable(file: Blob, family: Family, fallback: { name: string; message: string; cause?: unknown }): Promise<Error> {
  if (file.size === 0) return new NamedError('EmptyFile', COPY.EmptyFile);
  let head: Uint8Array;
  try {
    head = await readHead(file, 400);
  } catch (e) {
    return e as Error;
  }
  const wrong = wrongThing(family, head, file.size);
  if (wrong) return wrong;
  const c = sniffBytes(head.subarray(0, SNIFF_BYTES));
  // Every decoder has refused it and its start is no picture's start: it is not a picture (a text file named .jpg).
  if (c === 'unknown' && (family === 'image' || family === 'gif')) return new NamedError(WRONG_TYPE[family], copy(WRONG_TYPE[family], labelOf(c)), { cause: fallback.cause });
  try {
    if (file.size > 0 && looksCutShort(c, await readTail(file))) return new NamedError('FileTruncated', COPY.FileTruncated, { cause: fallback.cause });
  } catch {
    // The end could not be read: say what the decoder said.
  }
  return new NamedError(fallback.name, fallback.message.replace('{type}', labelOf(c)), { cause: fallback.cause });
}

/** The same checks for bytes already in memory (the PDF code holds the whole file): empty, another type, cut short, or a parser that refused a good start. */
export function explainBytes(bytes: Uint8Array, family: Family, fallback: { name: string; message: string; cause?: unknown }): NamedError {
  if (bytes.length === 0) return new NamedError('EmptyFile', COPY.EmptyFile);
  const wrong = wrongThing(family, bytes, bytes.length);
  if (wrong) return wrong;
  const c = sniffBytes(bytes.subarray(0, SNIFF_BYTES));
  if (looksCutShort(c, bytes.subarray(Math.max(0, bytes.length - 4096)))) return new NamedError('FileTruncated', COPY.FileTruncated, { cause: fallback.cause });
  return new NamedError(fallback.name, fallback.message.replace('{type}', labelOf(c)), { cause: fallback.cause });
}
