/**
 * Password-protected 7z and RAR archives: 7-Zip (7z-wasm, LGPL with the unRAR restriction) in a
 * background worker. Loaded only when an archive of those kinds needs it; the engine is served
 * from /vendor/ and the archive never leaves the tab. See sevenzip.worker.ts.
 */
import type { Reply, Request } from './sevenzip.worker';
import { fromWorkerFailure } from './worker-error';

/** Which engine family opens a file, from its first bytes. */
export async function sniffArchive(file: Blob): Promise<'7z' | 'rar' | null> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const at = (...sig: number[]) => sig.every((b, i) => head[i] === b);
  if (at(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return '7z';
  if (at(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07)) return 'rar';
  return null;
}

let worker: Worker | undefined;
let nextId = 0;

/** Extract everything with 7-Zip. Rejects with PasswordRequired, WrongPassword or ArchiveUnreadable. */
export function extractWithSevenZip(file: File, password: string, onProgress: (files: number) => void): Promise<{ path: string; blob: Blob }[]> {
  worker ??= new Worker(new URL('./sevenzip.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = (e: MessageEvent<Reply>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') return onProgress(msg.files);
      done();
      if (msg.type === 'done') resolve(msg.files);
      else reject(fromWorkerFailure(msg.name, msg.message));
    };
    const onError = (e: ErrorEvent) => {
      done();
      worker = undefined;
      w.terminate();
      reject(fromWorkerFailure('ArchiveUnreadable', e.message || 'The archive engine stopped.'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, file, password } satisfies Request);
  });
}
