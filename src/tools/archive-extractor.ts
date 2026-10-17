import { createShell, processEach, str } from '../lib/shell';
import { vendorDir } from '../lib/vendor';
import { UnreadableFile } from '../lib/input-error';
import type { OutputFile } from '../lib/files';
import { extractWithSevenZip, sniffArchive } from '../lib/sevenzip';

/**
 * Open ZIP, RAR, 7z, TAR and other archives in the browser with libarchive
 * (BSD-2-Clause) compiled to WebAssembly by libarchive.js (MIT). The worker
 * and the WebAssembly file are served from /vendor/; the archive never leaves the tab.
 *
 * libarchive cannot decrypt 7z or RAR, so a 7z or RAR that has a password goes to 7-Zip
 * (7z-wasm, see lib/sevenzip.ts) instead, which is downloaded only then.
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

/** Errors with a name of their own: the name is all a failed run records (see classifyError). */
class NamedError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}
const PASSWORD_REQUIRED = 'This archive is password-protected. Type its password in the box above and press Extract again.';
const WRONG_PASSWORD = 'The password is wrong, or the archive is damaged. Check the password and try again.';

/** A wrong password shows up in libarchive's messages in a few wordings. */
const badPassword = (e: unknown) => /passphrase|password|decrypt|encrypt/i.test(e instanceof Error ? e.message : String(e));

const NO_FILES = 'This archive has no files in it (only empty folders).';

async function viaLibarchive(file: File, password: string, status: (files: number) => void): Promise<OutputFile[]> {
  const Archive = await load();
  const archive = await Archive.open(file);
  try {
    const locked = await archive.hasEncryptedData();
    if (locked && !password) throw new NamedError('PasswordRequired', PASSWORD_REQUIRED);
    if (password) await archive.usePassword(password);
    const out: OutputFile[] = [];
    let total = 0;
    try {
      await archive.extractFiles(() => status(++total));
    } catch (e) {
      if (locked || badPassword(e)) {
        // Not every encrypted archive says so up front (content-only 7z): the first read does.
        throw password ? new NamedError('WrongPassword', WRONG_PASSWORD) : new NamedError('PasswordRequired', PASSWORD_REQUIRED);
      }
      throw e;
    }
    const list = (await archive.getFilesArray()) as { file: File; path: string }[];
    for (const { file: f, path } of list) {
      if (!(f instanceof File)) continue;
      out.push({ name: `${path}${f.name}`, blob: f });
    }
    if (!out.length) throw new UnreadableFile(NO_FILES);
    return out;
  } finally {
    await archive.close().catch(() => undefined);
  }
}

createShell({
  outputFormat: () => 'files',
  async process(files, progress) {
    const password = str('password', '');
    return processEach(files, progress, 'Opening', async (entry, i) => {
      const status = (n: number) => progress.set(`${entry.file.name}: ${plural(n, 'file')} extracted`, (i + 0.5) / files.length);
      const viaSevenZip = async (pw: string): Promise<OutputFile[]> => {
        const list = await extractWithSevenZip(entry.file, pw, status);
        if (!list.length) throw new UnreadableFile(NO_FILES);
        return list.map(({ path, blob }) => ({ name: path, blob }));
      };
      const kind = await sniffArchive(entry.file);
      // 7z and RAR with a password: libarchive cannot decrypt either, 7-Zip can.
      if (kind && password) return viaSevenZip(password);
      try {
        return await viaLibarchive(entry.file, password, status);
      } catch (e) {
        if (!kind || e instanceof NamedError) throw e;
        // libarchive could not list a 7z or RAR: file names hidden behind a password, or a variant 7-Zip reads.
        try {
          return await viaSevenZip('');
        } catch (e2) {
          throw e2 instanceof Error && e2.name === 'PasswordRequired' ? e2 : e;
        }
      }
    });
  },
  resultsTitle: (outputs) => `${plural(outputs.length, 'file')} extracted`,
});
