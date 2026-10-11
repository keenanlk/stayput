/**
 * Writes one output file into the origin private file system (OPFS) for opfs-output.ts.
 * createSyncAccessHandle works in a dedicated worker in every browser that has OPFS, which is why the
 * writing happens here and not with createWritable (only in Safari 26 and later).
 * Messages in: open, write (a chunk and where it goes), close, remove. Every message is answered with ok or an error.
 */
export type OpfsRequest =
  | { type: 'open'; dir: string; name: string }
  | { type: 'write'; data: Uint8Array; at: number }
  | { type: 'close' }
  | { type: 'remove' };
export type OpfsReply = { ok: true } | { ok: false; error: string };

let directory: FileSystemDirectoryHandle | undefined;
let name = '';
let handle: { write(data: Uint8Array, opts?: { at?: number }): number; truncate(size: number): void; flush(): void; close(): void } | undefined;

async function onMessage(m: OpfsRequest): Promise<void> {
  if (m.type === 'open') {
    directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(m.dir, { create: true });
    name = m.name;
    const file = await directory.getFileHandle(name, { create: true });
    const create = (file as unknown as { createSyncAccessHandle?: () => Promise<typeof handle> }).createSyncAccessHandle;
    if (!create) throw new Error('No sync access handle');
    handle = await create.call(file);
    handle!.truncate(0);
  } else if (m.type === 'write') {
    if (!handle) throw new Error('Not open');
    const wrote = handle.write(m.data, { at: m.at });
    if (wrote !== m.data.byteLength) throw new Error('Short write: the device may be out of space');
  } else if (m.type === 'close') {
    handle?.flush();
    handle?.close();
    handle = undefined;
  } else if (m.type === 'remove') {
    try {
      handle?.close();
    } catch {
      // Already closed.
    }
    handle = undefined;
    await directory?.removeEntry(name).catch(() => undefined);
  }
}

self.onmessage = (e: MessageEvent<OpfsRequest>) => {
  onMessage(e.data).then(
    () => (self as unknown as Worker).postMessage({ ok: true } satisfies OpfsReply),
    (err) => (self as unknown as Worker).postMessage({ ok: false, error: err instanceof Error ? `${err.name}` : 'Error' } satisfies OpfsReply),
  );
};
