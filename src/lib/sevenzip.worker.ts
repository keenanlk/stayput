/**
 * Opens password-protected 7z and RAR archives with 7-Zip compiled to WebAssembly (7z-wasm),
 * off the main thread. The archive is mounted read-only from the File itself, so it is not
 * copied into memory first; the files come back as Blobs. The engine is the one served from
 * /vendor/ (see src/data/vendor.json) and nothing is sent anywhere.
 */
import { vendorDir } from './vendor';
import { workerFailure } from './worker-error';

export type Request = { id: number; file: File; password: string };
export type Reply =
  | { id: number; type: 'progress'; files: number }
  | { id: number; type: 'done'; files: { path: string; blob: Blob }[] }
  | { id: number; type: 'error'; name: string; message: string };

interface FS {
  mkdir(path: string): void;
  mount(type: unknown, opts: unknown, mountpoint: string): unknown;
  readdir(path: string): string[];
  stat(path: string): { mode: number; size: number };
  isDir(mode: number): boolean;
  readFile(path: string): Uint8Array;
  unlink(path: string): void;
}
interface SevenZip {
  FS: FS;
  WORKERFS: unknown;
  callMain(args: string[]): number;
}
type Factory = (opts: Record<string, unknown>) => Promise<SevenZip>;

/** A failure with a name the page records as the kind of the failed run (see classifyError). */
class NamedError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

let factory: Promise<Factory> | undefined;
function load(): Promise<Factory> {
  factory ??= (import(/* @vite-ignore */ `${vendorDir('sevenzip')}7zz.es6.js`) as Promise<{ default: Factory }>).then((m) => m.default);
  return factory;
}

/** Every file below `dir`, as paths relative to it. */
function walk(fs: FS, dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const name of fs.readdir(dir)) {
    if (name === '.' || name === '..') continue;
    const path = `${dir}/${name}`;
    if (fs.isDir(fs.stat(path).mode)) out.push(...walk(fs, path, `${rel}${name}/`));
    else out.push(`${rel}${name}`);
  }
  return out;
}

async function extract(id: number, file: File, password: string): Promise<{ path: string; blob: Blob }[]> {
  const SevenZip = await load();
  const lines: string[] = [];
  let count = 0;
  const post = (msg: Reply) => (self as unknown as Worker).postMessage(msg);
  const note = (line: string) => {
    lines.push(line);
    // -bb1 prints "- path" for each file as it is extracted.
    if (line.startsWith('- ') && !line.endsWith('/')) post({ id, type: 'progress', files: ++count });
  };
  const sz = await SevenZip({
    locateFile: (name: string) => `${vendorDir('sevenzip')}${name}`,
    print: note,
    printErr: note,
    stdin: () => null,
  });
  sz.FS.mkdir('/in');
  sz.FS.mount(sz.WORKERFS, { blobs: [{ name: 'archive', data: file }] }, '/in');
  sz.FS.mkdir('/out');
  let code: number;
  try {
    // -p with the password in the same argument: nothing is parsed by a shell, so any characters work.
    code = sz.callMain(['x', '-y', '-bb1', '-o/out', ...(password ? [`-p${password}`] : []), '/in/archive']);
  } catch (e) {
    // The "Enter password:" prompt cannot be answered here and ends the run.
    code = 2;
    lines.push(String((e as { message?: string })?.message ?? e));
  }
  const text = lines.join('\n');
  if (/Enter password|Cannot open encrypted archive/i.test(text) && !password) {
    throw new NamedError('PasswordRequired', 'This archive is password-protected. Type its password in the box above and press Extract again.');
  }
  if (/Wrong password|Cannot open encrypted archive/i.test(text)) {
    throw new NamedError('WrongPassword', 'The password is wrong, or the archive is damaged. Check the password and try again.');
  }
  if (code !== 0 && code !== 1) {
    throw new NamedError('ArchiveUnreadable', 'This archive could not be read. It may be damaged, cut short, or in a variant this page cannot open.');
  }
  const out: { path: string; blob: Blob }[] = [];
  for (const path of walk(sz.FS, '/out')) {
    const data = sz.FS.readFile(`/out/${path}`);
    // Free the in-memory copy as soon as it is a Blob; archives can be larger than the tab likes.
    out.push({ path, blob: new Blob([data as Uint8Array<ArrayBuffer>]) });
    sz.FS.unlink(`/out/${path}`);
  }
  return out;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, file, password } = e.data;
  const post = (msg: Reply) => (self as unknown as Worker).postMessage(msg);
  try {
    post({ id, type: 'done', files: await extract(id, file, password) });
  } catch (err) {
    post({ id, type: 'error', ...workerFailure(err) });
  }
};
