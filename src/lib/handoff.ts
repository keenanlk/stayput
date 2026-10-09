/**
 * Carry a finished file to the next tool without picking it again.
 *
 * The file never leaves the device. When someone follows a "next step" link,
 * the sending page saves the output in this browser's IndexedDB (one record)
 * and notes its id in sessionStorage, which belongs to this tab only. The
 * next tool's page reads the id, loads the record, deletes it at once and
 * adds the file as if it had been chosen. No network request is involved.
 *
 * Cleanup, in order of how soon it happens:
 * - picked up: the record and the note are deleted on the spot;
 * - the page it was meant for is left without picking it up: deleted on
 *   pagehide, and on the next page load in the tab if that was missed;
 * - the tab closes first: the record stays until the next time any page of
 *   this site is opened at least TTL later, which deletes every stale record
 *   (a timestamp in localStorage says whether there is anything to look for).
 *
 * Every step is best effort. If storing fails (quota, private mode, a missing
 * API) or the file is over the limit, the link simply goes to the next tool,
 * which asks for a file as it always has. Nothing here ever shows an error.
 */

const DB_NAME = 'stayput-handoff';
const STORE = 'files';
const NOTE_KEY = 'stayput:handoff';
const MARKER_KEY = 'stayput:handoff-at';

/** How long a saved file may wait for the next tool. */
export const HANDOFF_TTL_MS = 5 * 60_000;
/** Largest file carried over. Matches the video size the caption tools are built for on a phone. */
export const HANDOFF_MAX_BYTES = 200 * 1024 * 1024;
/** Largest file carried as plain bytes, the fallback where Blobs cannot be stored: it needs a second copy in memory while saving. */
export const HANDOFF_MAX_BYTES_FALLBACK = 64 * 1024 * 1024;
/** Longest the click waits for the copy to be saved before following the link anyway. */
const SAVE_WAIT_MS = 20_000;

interface Saved {
  id: string;
  /** The file as a Blob; or, where the browser or mode will not keep Blobs, its bytes. */
  blob?: Blob;
  bytes?: ArrayBuffer;
  name: string;
  type: string;
  from: string;
  to: string;
  at: number;
}
interface Note {
  id: string;
  to: string;
}

const here = () => location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

function session(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
function local(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
function readNote(): Note | undefined {
  try {
    const raw = session()?.getItem(NOTE_KEY);
    const n = raw ? (JSON.parse(raw) as Note) : undefined;
    return n && typeof n.id === 'string' && typeof n.to === 'string' ? n : undefined;
  } catch {
    return undefined;
  }
}

function openDb(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
      req.onblocked = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Delete one record (if given) and every stale one; clear the timestamp when the store is empty. */
async function tidy(db: IDBDatabase, id?: string): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  if (id) store.delete(id);
  const now = Date.now();
  let left = 0;
  await new Promise<void>((resolve, reject) => {
    const cur = store.openCursor();
    cur.onerror = () => reject(cur.error);
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve();
      const at = (c.value as Partial<Saved>).at;
      if (c.key === id || typeof at !== 'number' || now - at > HANDOFF_TTL_MS || at > now + 60_000) c.delete();
      else left++;
      c.continue();
    };
  });
  await finished(tx);
  if (left === 0) local()?.removeItem(MARKER_KEY);
}

/** Delete this tab's pending record, whatever page it was meant for. */
async function discard(note: Note): Promise<void> {
  session()?.removeItem(NOTE_KEY);
  const db = await openDb();
  if (!db) return;
  try {
    await tidy(db, note.id);
  } finally {
    db.close();
  }
}

/**
 * Save `file` for the page at `to`. Resolves true when it is saved, false when
 * not (too big, storage refused or slow): the caller then follows the link
 * with nothing carried.
 */
export async function saveHandoff(file: { name: string; blob: Blob }, to: string, from: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (file.blob.size === 0 || file.blob.size > HANDOFF_MAX_BYTES) return false;
    const old = readNote();
    if (old) void discard(old);
    const at = Date.now();
    const id = `${at.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const saved = (async () => {
      const db = await openDb();
      if (!db) return false;
      try {
        local()?.setItem(MARKER_KEY, String(at));
        const put = async (body: Pick<Saved, 'blob' | 'bytes'>) => {
          const tx = db.transaction(STORE, 'readwrite');
          const record: Saved = { id, ...body, name: file.name, type: file.blob.type, from, to, at };
          tx.objectStore(STORE).put(record);
          await finished(tx);
        };
        try {
          await put({ blob: file.blob });
        } catch {
          // Some browsers and modes refuse to store a Blob; a smaller file can go in as bytes instead.
          if (file.blob.size > HANDOFF_MAX_BYTES_FALLBACK) return false;
          await put({ bytes: await file.blob.arrayBuffer() });
        }
        return true;
      } finally {
        db.close();
      }
    })();
    const ok = await Promise.race([saved, new Promise<false>((r) => (timer = setTimeout(() => r(false), SAVE_WAIT_MS)))]);
    if (!ok) {
      // A slow save may still land; the timestamp lets the next page load's sweep remove it.
      return false;
    }
    session()?.setItem(NOTE_KEY, JSON.stringify({ id, to } satisfies Note));
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Does a file input's accept list take this file? */
export function acceptedBy(accept: string, name: string, type: string): boolean {
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return true;
  const n = name.toLowerCase();
  const t = type.toLowerCase();
  return tokens.some((tok) => (tok.startsWith('.') ? n.endsWith(tok) : tok.endsWith('/*') ? t.startsWith(tok.slice(0, -1)) : t === tok));
}

export interface CarriedFile {
  file: File;
  from: string;
}

/**
 * The file saved for this page, if there is one: loaded, then deleted from
 * storage. Undefined when nothing is waiting, it has expired, or this tool
 * would not take it (the page then shows its normal upload prompt).
 */
export async function takeHandoff(accept: string): Promise<CarriedFile | undefined> {
  try {
    const note = readNote();
    if (!note || note.to !== here()) return undefined;
    session()?.removeItem(NOTE_KEY);
    const db = await openDb();
    if (!db) return undefined;
    try {
      const rec = (await request(db.transaction(STORE).objectStore(STORE).get(note.id))) as Saved | undefined;
      await tidy(db, note.id);
      const body = rec?.blob instanceof Blob ? rec.blob : rec?.bytes instanceof ArrayBuffer ? rec.bytes : undefined;
      if (!rec || !body || Date.now() - rec.at > HANDOFF_TTL_MS) return undefined;
      if (!acceptedBy(accept, rec.name, rec.type)) return undefined;
      return { file: new File([body], rec.name, { type: rec.type }), from: rec.from };
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * Run on every page load: delete anything stale, and anything this tab saved
 * for a page it is no longer on. Also arranges a delete on pagehide if this
 * is the page the file was meant for and it is closed before picking it up.
 */
export async function sweepHandoff(): Promise<void> {
  try {
    const note = readNote();
    if (note && note.to !== here()) {
      await discard(note);
      return;
    }
    if (note) addEventListener('pagehide', () => void (readNote() && discard(note)), { once: true });
    if (!note && !local()?.getItem(MARKER_KEY)) return;
    const db = await openDb();
    if (!db) return;
    try {
      await tidy(db);
    } finally {
      db.close();
    }
  } catch {
    // Nothing to clean up that we can reach.
  }
}
