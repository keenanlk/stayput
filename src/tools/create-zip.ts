import { bool, createShell, str } from '../lib/shell';
import { pathOf } from '../lib/folder-drop';
import { encryptedZip, plainZip, zipPath, type ZipEntry } from '../lib/zip-write';

/**
 * Pack files, or whole folders, into one ZIP in the tab, optionally locked
 * with AES-256. See src/lib/zip-write.ts.
 */

/** A name for the ZIP: what the user typed, else the one folder or file it holds, else "files". */
function zipName(entries: ZipEntry[]): string {
  const typed = str('zip-name', '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\.zip$/i, '');
  if (typed) return `${typed}.zip`;
  const tops = new Set(entries.map((e) => e.path.split('/')[0]));
  if (tops.size === 1) {
    const top = [...tops][0]!;
    return `${entries.length === 1 ? top.replace(/\.[^.]+$/, '') || top : top}.zip`;
  }
  return 'files.zip';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

createShell({
  folders: true,
  outputFormat: () => (bool('lock') ? 'aes-zip' : 'zip'),
  async process(files, progress) {
    const locked = bool('lock');
    const password = str('password', '');
    if (locked && !password) throw new Error('Type a password to lock the ZIP with, or untick "Lock with a password".');
    const taken = new Set<string>();
    const entries: ZipEntry[] = [];
    for (const [i, f] of files.entries()) {
      progress.set(`Reading ${f.file.name} (${i + 1} of ${files.length})`, (i / files.length) * 0.3);
      entries.push({ path: zipPath(pathOf(f.file), taken), data: new Uint8Array(await f.file.arrayBuffer()), modified: new Date(f.file.lastModified || Date.now()) });
    }
    progress.set(locked ? 'Compressing and encrypting' : 'Compressing', 0.3);
    const bytes = locked
      ? await encryptedZip(entries, password, (done) => progress.set(`Encrypting file ${done} of ${entries.length}`, 0.3 + (0.7 * done) / entries.length))
      : plainZip(entries);
    const inputSize = files.reduce((n, f) => n + f.file.size, 0);
    return [
      {
        name: zipName(entries),
        blob: new Blob([bytes as BlobPart], { type: 'application/zip' }),
        originalSize: inputSize,
        note: `${plural(entries.length, 'file')}${locked ? ', AES-256 locked' : ''}`,
      },
    ];
  },
  resultsTitle: () => (bool('lock') ? 'ZIP locked and ready' : 'ZIP ready'),
});
