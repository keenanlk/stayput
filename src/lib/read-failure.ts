import { NamedError } from './input-error';
import { kindOf, sniffBytes, SNIFF_BYTES, type Container } from './sniff';
/**
 * A file the browser could not read from disk (NotReadableError): on Android this is a big video, one the
 * phone moved or is still preparing, or a cloud file it let go of. It is the file or the phone, not the tool,
 * and it often passes on a second read, so a job reads the file once more before it says so. Kept free of
 * browser and codec imports so a spec can drive it directly.
 */

/** Whether `e`, or the error it wraps, is the browser failing to read the file. */
export function isNotReadable(e: unknown): boolean {
  for (let depth = 0; depth < 4 && typeof e === 'object' && e; depth++) {
    if ((e as { name?: string }).name === 'NotReadableError') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** Where in a job the browser stopped reading: at the first or last byte (a file that is not reachable), part-way through (the default), or when it ran out of memory for the read. */
export type ReadStage = 'probe' | 'mid' | 'memory';

/**
 * The error to show for a file that could not be read. Its name stays NotReadableError, which is what the code checks for; the stage
 * rides along as a property, and a failed run records it as NotReadableProbe, NotReadableMidRead or OutOfMemoryError (see classifyError).
 */
export function notReadable(cause?: unknown, stage?: ReadStage): Error {
  const out = new NamedError('ReadFailureFailed', 'This file could not be read. If it is in Google Photos, Drive or another cloud app, save it to the phone first, then pick it from the Files app (or the Downloads or Movies folder) and try again.');
  out.name = 'NotReadableError';
  out.cause = cause;
  // A failure that was already placed (the probe's) keeps its place when a tool wraps it again.
  (out as Error & { stage?: ReadStage }).stage = stage ?? (cause as { stage?: ReadStage } | undefined)?.stage ?? 'mid';
  return out;
}

/** The class a failed run records for a NotReadableError anywhere in `e`'s cause chain, or undefined for any other error. */
export function notReadableClass(e: unknown): 'NotReadableProbe' | 'NotReadableMidRead' | 'OutOfMemoryError' | undefined {
  for (let depth = 0; depth < 4 && typeof e === 'object' && e; depth++) {
    if ((e as { name?: string }).name === 'NotReadableError') {
      const stage = (e as { stage?: ReadStage }).stage;
      return stage === 'probe' ? 'NotReadableProbe' : stage === 'memory' ? 'OutOfMemoryError' : 'NotReadableMidRead';
    }
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Whether a read failed because memory ran out (a RangeError from an array buffer that would not allocate), not because the file was out of reach. */
function ranOutOfMemory(e: unknown): boolean {
  return e instanceof RangeError || (e instanceof Error && /allocation failed|out of memory/i.test(e.message));
}

/**
 * For a track probe that treats "could not open it" as "no such track": a read the browser refused stays that, and a read that
 * ran out of memory stays that (OutOfMemoryError), so neither is reported as a file with no video or sound. Anything else is null.
 */
export function unlessReadFailure(e: unknown): null {
  if (isNotReadable(e)) throw e;
  if (ranOutOfMemory(e)) throw readMemoryError(e);
  return null;
}

/** A read that needed more memory than the device had: the file is fine, the device is short. */
export function readMemoryError(cause: unknown): Error {
  return new NamedError('OutOfMemoryError', 'This device ran out of memory while reading this file. Close other tabs and apps and try again, use a smaller file, or use a computer.', { cause });
}

/** Files whose first byte stayed out of reach. The same File object is never going to read again, so a second failure on it says to pick it again. */
const unreachable = new WeakSet<object>();

/** The refusal for a file that has already failed to read, and still does: the same File object will not come back, so the person picks it again. */
function pickAgain(cause: unknown): Error {
  const out = new NamedError('UnreadableFileGone', 'This file could not be read. It may have been moved, deleted or still be syncing from a cloud app. Pick it again, or save it to the phone first.');
  out.cause = cause;
  return out;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One byte at `at`, read; tried again once after `wait` ms: a content:// file can need a moment. */
async function readByte(file: Blob, at: number, wait: number): Promise<void> {
  try {
    await file.slice(at, at + 1).arrayBuffer();
  } catch (e) {
    if (!isNotReadable(e)) throw e;
    await pause(wait);
    await file.slice(at, at + 1).arrayBuffer();
  }
}

/**
 * Checks the browser can reach the file: the first byte must read (each read is tried twice). A last byte that will not read is not
 * taken as the end of the file: if the middle reads, the run goes on, and a tool that really needs the end fails there with a mid-read
 * failure. A file whose first byte failed before, and fails again, is UnreadableFileGone (pick it again) rather than the same message.
 */
export async function probeReadable(file: Blob, wait = 250): Promise<void> {
  if (file.size === 0) return;
  try {
    await readByte(file, 0, wait);
  } catch (e) {
    if (!isNotReadable(e)) throw notReadable(e, 'probe');
    if (unreachable.has(file)) throw pickAgain(e);
    unreachable.add(file);
    throw notReadable(e, 'probe');
  }
  if (file.size < 2) return;
  try {
    await readByte(file, file.size - 1, wait);
  } catch (e) {
    // Only the end is out of reach. Can the middle be read? Then the data is there in pieces and the run may go on.
    try {
      await readByte(file, Math.floor(file.size / 2), 0);
    } catch {
      throw notReadable(e, 'probe');
    }
  }
}

/**
 * Runs `job`; if it fails because the file could not be read, checks the file is reachable and runs it once more.
 * A file that is still unreadable, and any other failure, comes back as it was.
 */
export async function retryUnreadable<T>(file: Blob, job: () => Promise<T>, onNotice?: (message: string) => void, pause = 1000): Promise<T> {
  try {
    return await job();
  } catch (e) {
    if (!isNotReadable(e)) throw e;
    await new Promise((r) => setTimeout(r, pause));
    await probeReadable(file);
    onNotice?.('The file could not be read the first time. Trying once more.');
    return await job();
  }
}

/** Videos up to this size are copied into memory. A larger one is copied to temporary disk space when there is room (input-copy.ts), otherwise only checked: a copy in memory would hold it twice, and for a big file the failure is usually the size of the read itself, which a copy cannot fix. */
export const SNAPSHOT_LIMIT = 50 * 1024 * 1024;
const CHUNK = 8 * 1024 * 1024;

/** Copies made by snapshotFile, so a second call on one (a tool that still takes its own copy) returns it as it is. */
const snapshots = new WeakSet<object>();

/** Copies a tool took itself, right after the pick (the splitter's), by the File they are a copy of: the run uses them rather than reading the picked File again. */
const earlyCopies = new WeakMap<File, Promise<File>>();

/** Records `copy` (pending or done) as the copy of `picked` that the run should work from. */
export function noteEarlyCopy(picked: File, copy: Promise<File>): void {
  earlyCopies.set(picked, copy);
}

/** The early copy of `picked` that was taken and holds, or undefined. */
export async function earlyCopyOf(picked: File): Promise<File | undefined> {
  return earlyCopies.get(picked)?.catch(() => undefined);
}

/**
 * Reads bytes `start` to `end` of `file`, each try after the pauses in `pauses`. A read that never works is NotReadableError
 * (or OutOfMemoryError when the memory ran out). The one exception: the file's last byte alone is out of reach while everything
 * before it reads. That is not taken as a lost file, the result is 'end-only', and the caller goes on with the file as it was.
 */
export async function readPiece(file: Blob, start: number, end: number, pauses = [250, 750]): Promise<ArrayBuffer | 'end-only'> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await file.slice(start, end).arrayBuffer();
    } catch (e) {
      if (ranOutOfMemory(e)) throw readMemoryError(e);
      if (!isNotReadable(e)) throw e;
      if (attempt >= pauses.length) {
        if (end === file.size && end - start > 1 && (await file.slice(start, end - 1).arrayBuffer().then(() => true, () => false))) return 'end-only';
        unreachable.add(file);
        throw notReadable(e);
      }
      await new Promise((r) => setTimeout(r, pauses[attempt]));
    }
  }
}

/**
 * Copies `file` into memory in one go, while the browser still lets us at it. On Android a picked file can stop being
 * readable a moment later (a content:// file from Photos or Drive, read late or twice), so the run takes this copy first
 * and works from it. Each piece is tried a few times; a file that never reads ends with NotReadableError after about a
 * second. A file over `limit` is only checked, and returned as it was. Nothing leaves the device.
 */
export async function snapshotFile<T extends File>(file: T, limit = SNAPSHOT_LIMIT, pauses = [250, 750]): Promise<File> {
  if (snapshots.has(file)) return file;
  if (file.size === 0 || file.size > limit) {
    await probeReadable(file);
    return file;
  }
  // A copy that failed all its tries on this File before: a File the browser lost (changed or re-saved after it was picked) does not come back.
  if (unreachable.has(file)) await probeReadable(file, 0);
  const parts: ArrayBuffer[] = [];
  for (let at = 0; at < file.size; at += CHUNK) {
    const piece = await readPiece(file, at, Math.min(file.size, at + CHUNK), pauses);
    if (piece === 'end-only') return file;
    parts.push(piece);
  }
  const copy = new File(parts, file.name, { type: file.type, lastModified: file.lastModified });
  snapshots.add(copy);
  return copy;
}

/**
 * Runs `job` over all of a run's files; if it fails because a file could not be read, waits a moment, checks every file is
 * reachable and runs it once more (see retryUnreadable, which does the same for one file).
 */
export async function retryRun<T>(files: readonly Blob[], job: () => Promise<T>, onNotice?: (message: string) => void, pause = 1000): Promise<T> {
  try {
    return await job();
  } catch (e) {
    // A failure that already checked the files and found one out of reach (a tool's own retry did) is not tried a third time.
    if (!isNotReadable(e) || notReadableClass(e) === 'NotReadableProbe') throw e;
    await new Promise((r) => setTimeout(r, pause));
    for (const file of files) await probeReadable(file);
    onNotice?.('The file could not be read the first time. Trying once more.');
    return await job();
  }
}

/** Whether `e`, or the error it wraps, is the browser saying the file is no longer there (NotFoundError): moved, deleted or its permission taken back. */
export function isFileGone(e: unknown): boolean {
  for (let depth = 0; depth < 4 && typeof e === 'object' && e; depth++) {
    if ((e as { name?: string }).name === 'NotFoundError') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Runs `job` on a picked file; if the browser says the file is gone (or could not be read), waits a moment and reads it once
 * more. A file that is still gone ends as UnreadableFileGone with a message that says to pick it again; any other failure comes
 * back as it was.
 */
export async function rereadOnce<T>(job: () => Promise<T>, pause = 500): Promise<T> {
  try {
    return await job();
  } catch (e) {
    if (!isFileGone(e) && !isNotReadable(e)) throw e;
    await new Promise((r) => setTimeout(r, pause));
    try {
      return await job();
    } catch (again) {
      if (!isFileGone(again) && !isNotReadable(again)) throw again;
      const out = new NamedError('UnreadableFileGone', 'This file could not be read. It may have been moved, deleted or still be syncing from a cloud app. Pick it again, or save it to the phone first.');
      out.cause = again;
      throw out;
    }
  }
}

/** How much of the start of the file is looked at. */
export const HEAD_BYTES = 65536;

/** The first bytes, read up to twice. Throws the named cause when they cannot be had. */
export async function readHead(file: Blob, wait: number): Promise<Uint8Array> {
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


/* ---- Why a file could not be opened -------------------------------------------------------------------------------------------------
 * What was wrong with a file that a tool could not open, told apart by looking at the file itself (its size, its first bytes and, for a few
 * formats, its last): an empty file, a file of another type, a file cut short, or a file whose start is right but which this browser's decoder
 * refused. Each cause is a class name of its own, which is all a failed run records. The sentences live in one table, COPY.
 * (Kept in this file, which every page already loads, so a page that never fails fetches nothing more.)
 */
export type Family = 'image' | 'gif' | 'pdf' | 'archive';

/** The user-facing sentences. `{type}` is replaced with what the file really is ("a PDF", "a video"). */
export const COPY = {
  EmptyFile: 'This file is empty (0 bytes). Pick it again, or check that it finished saving or downloading.',
  NotAnImageFile: 'This file is not a picture. It looks like {type}. Pick a picture file, such as a PNG or JPG.',
  NotAPdfFile: 'This file is not a PDF. It looks like {type}. Pick a PDF.',
  NotAnArchiveFile: 'This file is not an archive this tool opens. It looks like {type}. Pick a ZIP, 7z, RAR or TAR file.',
  NotAGifFile: 'This file is not a GIF. It looks like {type}. Pick a GIF.',
  FileTruncated: 'This file looks cut short, so it cannot be read in full. Download or copy it again, then pick the new copy.',
  ImageDecodeFailed: 'This browser could not open this file as a picture. It looks like {type}. Save a copy as a PNG or JPG in another app and pick that, or try another browser.',
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
