/**
 * A file the browser could not read from disk (NotReadableError): on Android this is a big video, one the
 * phone moved or is still preparing, or a cloud file it let go of. It is the file or the phone, not the tool,
 * and it often passes on a second read, so a job reads the file once more before it says so. Kept free of
 * browser and codec imports so a spec can drive it directly.
 */
import { NamedError } from './input-error';

/** Whether `e`, or the error it wraps, is the browser failing to read the file. */
export function isNotReadable(e: unknown): boolean {
  for (let depth = 0; depth < 4 && typeof e === 'object' && e; depth++) {
    if ((e as { name?: string }).name === 'NotReadableError') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** The error to show for a file that could not be read. Its name stays NotReadableError, which is what a failed run records. */
export function notReadable(cause?: unknown): Error {
  const out = new NamedError(
    'NotReadableError',
    'This file could not be read. If it is in Google Photos, Drive or another cloud app, save it to the phone first, then pick it from the Files app (or the Downloads or Movies folder) and try again.',
  );
  out.cause = cause;
  return out;
}

/** Reads the first and last byte, which is enough for the browser to say whether it can reach the file at all. */
export async function probeReadable(file: Blob): Promise<void> {
  if (file.size === 0) return;
  try {
    await file.slice(0, 1).arrayBuffer();
    await file.slice(file.size - 1).arrayBuffer();
  } catch (e) {
    throw notReadable(e);
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

/** Videos up to this size are copied into memory; a larger one is only checked, because a phone cannot hold it twice. */
export const SNAPSHOT_LIMIT = 600 * 1024 * 1024;
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
        if (!isNotReadable(e)) throw e;
        if (attempt >= pauses.length) throw notReadable(e);
        await new Promise((r) => setTimeout(r, pauses[attempt]));
      }
    }
  }
  return new File(parts, file.name, { type: file.type, lastModified: file.lastModified });
}
