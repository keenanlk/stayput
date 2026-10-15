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

/** The error to show for a file that could not be read. Its name stays NotReadableError, which is what a failed run records. */
export function notReadable(cause?: unknown): Error {
  const out = new Error('This file could not be read. Pick the video again, or copy it to the phone first, and try again.');
  out.name = 'NotReadableError';
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
