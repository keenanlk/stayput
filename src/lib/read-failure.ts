import { NamedError } from './input-error';
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

/** A read that needed more memory than the device had: the file is fine, the device is short. */
export function readMemoryError(cause: unknown): Error {
  return new NamedError('OutOfMemoryError', 'This device ran out of memory while reading this file. Close other tabs and apps and try again, use a smaller file, or use a computer.', { cause });
}

/** Reads the first and last byte, which is enough for the browser to say whether it can reach the file at all. */
export async function probeReadable(file: Blob): Promise<void> {
  if (file.size === 0) return;
  try {
    await file.slice(0, 1).arrayBuffer();
    await file.slice(file.size - 1).arrayBuffer();
  } catch (e) {
    throw notReadable(e, 'probe');
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

/** Videos up to this size are copied into memory. A larger one is only checked: a copy would hold it in memory twice, and for a big file the failure is usually the size of the read itself, which a copy cannot fix. */
export const SNAPSHOT_LIMIT = 50 * 1024 * 1024;
const CHUNK = 8 * 1024 * 1024;

/**
 * Copies `file` into memory in one go, while the browser still lets us at it. On Android a picked file can stop being
 * readable a moment later (a content:// file from Photos or Drive, read late or twice), so a tool takes this copy first
 * and works from it. Each piece is tried a few times; a file that never reads ends with NotReadableError after about a
 * second. A file over `limit` is only checked, and returned as it was. Nothing leaves the device.
 */
export async function snapshotFile<T extends File>(file: T, limit = SNAPSHOT_LIMIT, pauses = [250, 750]): Promise<File> {
  if (file.size === 0 || file.size > limit) {
    await probeReadable(file);
    return file;
  }
  const parts: ArrayBuffer[] = [];
  for (let at = 0; at < file.size; at += CHUNK) {
    for (let attempt = 0; ; attempt++) {
      try {
        parts.push(await file.slice(at, Math.min(file.size, at + CHUNK)).arrayBuffer());
        break;
      } catch (e) {
        if (ranOutOfMemory(e)) throw readMemoryError(e);
        if (!isNotReadable(e)) throw e;
        if (attempt >= pauses.length) throw notReadable(e);
        await new Promise((r) => setTimeout(r, pauses[attempt]));
      }
    }
  }
  return new File(parts, file.name, { type: file.type, lastModified: file.lastModified });
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
