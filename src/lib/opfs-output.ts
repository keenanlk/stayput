/**
 * Where a video's output is written while it is made: a temporary file on this device (the browser's
 * origin private file system) instead of a growing buffer in memory. A two-minute iPhone clip is a
 * couple of hundred MB; held in memory while muxed and then copied into a Blob it needed about twice
 * that, which ran Safari out of memory. On disk the tab only ever holds one chunk.
 *
 * The file never leaves the device and has no name from the user: it is called stayput-<time>-<random>.
 * It is deleted when the results are cleared or replaced, when the page is left, and, for anything a
 * closed tab left behind, on the next visit to any page (sweepOutputs). A file that is being carried to
 * the next tool (handoff.ts) is copied out of the file first (detachOutput), so deleting it cannot hurt that copy.
 *
 * Where this browser cannot write to OPFS from a worker (no OPFS, private mode, a failed write at
 * start) openOpfsOutput resolves undefined and the caller keeps the output in memory, as before.
 */
import type { StreamTarget, StreamTargetChunk } from 'mediabunny';
import type { OpfsReply, OpfsRequest } from './opfs-output.worker';

const DIR = 'stayput-outputs';
const PREFIX = 'stayput-';
/** A file this old is swept even where Web Locks cannot say whether a tab still owns it. */
const STALE_MS = 6 * 60 * 60_000;
const CHUNK = 8 * 1024 * 1024;

/** Writing the temporary file failed part way (no room left on the device, say). Its name is what a failed run records. */
export class OutputWriteError extends Error {
  constructor() {
    super('This device ran out of room to save the video. Free some space and try again, or use a shorter video.');
    this.name = 'OutputWriteError';
  }
}

export interface OpfsOutput {
  target: StreamTarget;
  /** Finish the file and return it as a Blob that reads from the file on disk. */
  finish(type: string): Promise<Blob>;
  /** Give up: close and delete the file. */
  abort(): Promise<void>;
}

/** Blob handed out by finish() → how to delete its file. */
const owned = new Map<Blob, { remove: () => Promise<void> }>();
let installed = false;

export function opfsOutputAvailable(): boolean {
  try {
    return typeof Worker !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
  } catch {
    return false;
  }
}

/** True when the browser says there is room for about `bytes` more. Unknown counts as room. */
async function hasRoomFor(bytes: number): Promise<boolean> {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    return quota === undefined || usage === undefined || quota - usage > bytes;
  } catch {
    return true;
  }
}

function call(worker: Worker, message: OpfsRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<OpfsReply>) => (e.data.ok ? resolve() : reject(new Error(e.data.error)));
    worker.onerror = (e) => reject(new Error(e.message || 'Worker error'));
    worker.postMessage(message);
  });
}

/** Keep a lock named for the file while this tab owns it, so a later sweep can tell a live file from a left-behind one. */
function lockFor(name: string): () => void {
  let release = () => {};
  try {
    void navigator.locks?.request(`stayput-output:${name}`, () => new Promise<void>((r) => (release = r)));
  } catch {
    // No Web Locks: age decides instead.
  }
  return () => release();
}

/**
 * Open a temporary output file. `expectedBytes` is a guess at its size (the input's); when the browser's storage
 * quota has less room than that, this resolves undefined and the caller keeps the output in memory.
 */
export async function openOpfsOutput(expectedBytes = 0): Promise<OpfsOutput | undefined> {
  if (!opfsOutputAvailable()) return undefined;
  if (expectedBytes > 0 && !(await hasRoomFor(Math.ceil(expectedBytes * 1.3) + 64 * 1024 * 1024))) return undefined;
  let worker: Worker | undefined;
  try {
    worker = new Worker(new URL('./opfs-output.worker.ts', import.meta.url), { type: 'module' });
    const name = `${PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await call(worker, { type: 'open', dir: DIR, name });
    const { StreamTarget } = await import('mediabunny');
    const unlock = lockFor(name);
    installPageHooks();
    const w = worker;
    // Writes go one at a time; the stream's backpressure holds the encoder back while the disk catches up.
    const writable = new WritableStream<StreamTargetChunk>({
      write: (chunk) =>
        call(w, { type: 'write', data: chunk.data, at: chunk.position }).catch(() => {
          throw new OutputWriteError();
        }),
    });
    let finished = false;
    const remove = async () => {
      try {
        if (!finished) {
          // Still writing: the worker holds the file open, so it closes it before deleting.
          await call(w, { type: 'remove' });
          w.terminate();
        } else {
          const root = await navigator.storage.getDirectory();
          await (await root.getDirectoryHandle(DIR)).removeEntry(name);
        }
      } catch {
        // Gone already, or not reachable: the next visit's sweep covers it.
      }
      w.terminate();
      unlock();
    };
    return {
      target: new StreamTarget(writable, { chunked: true, chunkSize: CHUNK }),
      async finish(type) {
        await call(w, { type: 'close' });
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(DIR);
        const file = await (await dir.getFileHandle(name)).getFile();
        w.terminate();
        finished = true;
        // A Blob over the file: nothing is copied into memory.
        const blob = file.slice(0, file.size, type);
        owned.set(blob, { remove });
        return blob;
      },
      async abort() {
        await remove();
      },
    };
  } catch {
    worker?.terminate();
    return undefined;
  }
}

/**
 * A copy of this output that does not depend on its temporary file, for carrying to the next tool: browsers may store
 * a file-backed Blob by reference, and the file is deleted when this page is left. Anything else is returned as it is.
 */
export async function detachOutput(blob: Blob): Promise<Blob> {
  if (!owned.has(blob)) return blob;
  return new Blob([await blob.arrayBuffer()], { type: blob.type });
}

/** Delete the file behind an output, once nothing is still reading it. Does nothing for an ordinary Blob. */
export async function releaseOutput(blob: Blob): Promise<void> {
  const entry = owned.get(blob);
  if (!entry) return;
  owned.delete(blob);
  await entry.remove();
}

/** Leaving the page: delete what this tab still has. */
function installPageHooks(): void {
  if (installed) return;
  installed = true;
  addEventListener('pagehide', (e: PageTransitionEvent) => {
    // A page kept for the back button comes back with its results; the next visit's sweep deals with it later.
    if (e.persisted) return;
    for (const blob of [...owned.keys()]) void releaseOutput(blob);
  });
}

/** On every page load: delete files a closed or reloaded tab left behind. Best effort. */
export async function sweepOutputs(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') return;
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(DIR).catch(() => undefined);
    if (!dir) return;
    const names: string[] = [];
    for await (const [name] of (dir as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) names.push(name);
    for (const name of names) {
      if (!name.startsWith(PREFIX)) continue;
      let orphan: boolean;
      if (navigator.locks) {
        // The lock is held by a live tab (the callback gets null) → leave the file. Free → nobody owns it.
        orphan = await navigator.locks.request(`stayput-output:${name}`, { ifAvailable: true }, (lock) => lock !== null);
      } else {
        const at = await dir.getFileHandle(name).then((h) => h.getFile()).then((f) => f.lastModified, () => 0);
        orphan = Date.now() - at > STALE_MS;
      }
      if (!orphan) continue;
      await dir.removeEntry(name).catch(() => undefined);
    }
  } catch {
    // Nothing to clean up that we can reach.
  }
}
