import { createShell, processEach, str } from '../lib/shell';
import { vendorDir } from '../lib/vendor';
import type { OutputFile } from '../lib/files';

/**
 * Open ZIP, RAR, 7z, TAR and other archives in the browser with libarchive
 * (BSD-2-Clause) compiled to WebAssembly by libarchive.js (MIT). The worker
 * and the WebAssembly file are served from /vendor/; the archive never leaves the tab.
 */

type Archive = typeof import('libarchive.js').Archive;
let lib: Promise<Archive> | undefined;
function load(): Promise<Archive> {
  lib ??= import('libarchive.js').then(({ Archive }) => {
    Archive.init({ workerUrl: `${vendorDir('libarchive')}worker-bundle.js` });
    return Archive;
  });
  return lib;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** A wrong password shows up in libarchive's messages in a few wordings. */
const badPassword = (e: unknown) => /passphrase|password|decrypt|encrypt/i.test(e instanceof Error ? e.message : String(e));

createShell({
  outputFormat: () => 'files',
  async process(files, progress) {
    const password = str('password', '');
    const Archive = await load();
    return processEach(files, progress, 'Opening', async (entry, i) => {
      const archive = await Archive.open(entry.file);
      try {
        const locked = await archive.hasEncryptedData();
        if (locked && !password) throw new Error('This archive is password-protected. Type its password in the box above and press Extract again.');
        if (password) await archive.usePassword(password);
        const out: OutputFile[] = [];
        let total = 0;
        try {
          await archive.extractFiles((e: { file: File; path: string }) => {
            total++;
            progress.set(`${entry.file.name}: ${plural(total, 'file')} extracted`, (i + 0.5) / files.length);
          });
        } catch (e) {
          if (locked || badPassword(e)) throw new Error('The password is wrong, or the archive is damaged. Check the password and try again.');
          throw e;
        }
        const list = (await archive.getFilesArray()) as { file: File; path: string }[];
        for (const { file, path } of list) {
          if (!(file instanceof File)) continue;
          out.push({ name: `${path}${file.name}`, blob: file });
        }
        if (!out.length) throw new Error('This archive has no files in it (only empty folders).');
        return out;
      } finally {
        await archive.close().catch(() => undefined);
      }
    });
  },
  resultsTitle: (outputs) => `${plural(outputs.length, 'file')} extracted`,
});
