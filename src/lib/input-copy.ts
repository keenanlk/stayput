/**
 * The copy of a run's audio and video files that the tool works from, taken once when Run is pressed, while the browser still
 * lets us at them (on Android a picked file can stop reading a moment after it was picked).
 *  - Up to SNAPSHOT_LIMIT: a copy in memory (snapshotFile).
 *  - Bigger, with room on the device (navigator.storage.estimate): a temporary file in the origin private file system, read back
 *    as a File that lives on disk, so a big clip is not held in memory twice. Its file is deleted at the next run, on Clear, when
 *    the page is left (opfs-output.ts) and, for one a closed tab left behind, on the next visit (sweepOutputs). Never right after
 *    a download: the results may still be on screen.
 *  - Bigger, no room or no OPFS: the file as it is, after a check that it can be reached.
 * Nothing leaves the device and the copy has no name of the person's own: the File keeps the name only in memory.
 */
import { openOpfsOutput, opfsOutputAvailable, releaseOutput, OutputWriteError } from './opfs-output';
import { probeReadable, readPiece, snapshotFile, SNAPSHOT_LIMIT } from './read-failure';

const CHUNK = 8 * 1024 * 1024;
/** OPFS-backed copies of the current run, to delete when the next run starts or the list is cleared. */
let held: Blob[] = [];

/** Delete the temporary disk copies of the previous run. */
export async function releaseInputCopies(): Promise<void> {
  const blobs = held;
  held = [];
  await Promise.all(blobs.map((b) => releaseOutput(b)));
}

async function copyToDisk(file: File): Promise<File | undefined> {
  if (!opfsOutputAvailable()) return undefined;
  const out = await openOpfsOutput(file.size);
  if (!out) return undefined;
  try {
    for (let at = 0; at < file.size; at += CHUNK) {
      const piece = await readPiece(file, at, Math.min(file.size, at + CHUNK));
      if (piece === 'end-only') {
        await out.abort();
        return undefined;
      }
      await out.write(new Uint8Array(piece), at);
    }
    const blob = await out.finish(file.type);
    held.push(blob);
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
  } catch (e) {
    await out.abort();
    // No room left to write: carry on as if there had been none to begin with.
    if (e instanceof OutputWriteError) return undefined;
    throw e;
  }
}

/** The file to work from: see the notes at the top of this file. Throws NotReadableError or OutOfMemoryError for a file that cannot be read. */
export async function copyInput(file: File): Promise<File> {
  // First, whether the file is reachable at all: a file that is not is NotReadableProbe now, or UnreadableFileGone for one that failed before.
  await probeReadable(file);
  if (file.size > SNAPSHOT_LIMIT) return (await copyToDisk(file)) ?? file;
  return snapshotFile(file);
}
