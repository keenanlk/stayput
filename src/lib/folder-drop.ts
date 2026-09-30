/**
 * Folders dropped on the page. The browser hands a dropped folder over as one
 * empty "file"; its contents are only reachable by walking the drop's entries,
 * which must be read before the drop event returns. Each file found keeps its
 * path inside the dropped folder, for tools that preserve folders (Create ZIP).
 */

/** Paths of files that came from a dropped folder, e.g. "Trip/day 1/beach.jpg". */
const paths = new WeakMap<File, string>();

/** The path a file had in its folder: from a folder drop, a folder picker, or just its name. */
export function pathOf(file: File): string {
  return paths.get(file) || file.webkitRelativePath || file.name;
}

async function walk(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    paths.set(file, entry.fullPath.replace(/^\/+/, ''));
    out.push(file);
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries returns at most 100 entries per call; call until it returns none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const child of batch) await walk(child, out);
  }
}

/**
 * The files in a drop, with folders opened up. Returns undefined when the drop
 * has no folders, so callers can use `dataTransfer.files` as before.
 */
export function droppedFiles(dt: DataTransfer): Promise<File[]> | undefined {
  const entries = [...dt.items].map((i) => (i.kind === 'file' ? i.webkitGetAsEntry?.() : null)).filter((e): e is FileSystemEntry => !!e);
  if (!entries.some((e) => e.isDirectory)) return undefined;
  return (async () => {
    const out: File[] = [];
    for (const e of entries) await walk(e, out);
    return out;
  })();
}
