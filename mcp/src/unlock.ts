/**
 * Node stand-in for src/lib/unlock.ts, swapped in for pdf.ts at build time.
 * The site loads qpdf (WebAssembly) with a <script> tag and asks for a
 * password with a dialog; here the same qpdf build comes from node_modules
 * and the password comes from the tool call (see `withPassword`).
 */
import { createRequire } from 'node:module';
import { looksEncrypted, PasswordRequiredError } from '../../src/lib/unlock';

interface QpdfModule {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  callMain(args: string[]): number;
}
type QpdfFactory = (opts: { noInitialRun?: boolean }) => Promise<QpdfModule>;

/*
 * The qpdf build binds its stderr to console.error when it is created and
 * reports a wrong password only there, so a wrapper installed at creation
 * collects each run's messages (and keeps them off the terminal).
 */
let stderr: string[] = [];
let modulePromise: Promise<QpdfModule> | undefined;
function loadModule(): Promise<QpdfModule> {
  modulePromise ??= (async () => {
    const factory = createRequire(import.meta.url)('@neslinesli93/qpdf-wasm') as QpdfFactory;
    const original = console.error;
    console.error = (...args: unknown[]) => void stderr.push(args.map(String).join(' '));
    try {
      return await factory({ noInitialRun: true });
    } finally {
      console.error = original;
    }
  })();
  return modulePromise;
}

async function decrypt(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const qpdf = await loadModule();
  qpdf.FS.writeFile('/in.pdf', bytes);
  stderr = [];
  let code: number;
  try {
    code = qpdf.callMain(['--decrypt', ...(password ? [`--password=${password}`] : []), '/in.pdf', '/out.pdf']);
  } catch (e) {
    code = typeof e === 'object' && e && 'status' in e ? Number((e as { status: unknown }).status) : 1;
  } finally {
    try {
      qpdf.FS.unlink('/in.pdf');
    } catch {
      /* already gone */
    }
  }
  const messages = stderr.join('\n');
  if (code !== 0) {
    if (/invalid password/i.test(messages)) throw new PasswordRequiredError(password !== '');
    const detail = messages.trim().split('\n').pop()?.replace(/^this\.program:\s*(\/in\.pdf:\s*)?/, '');
    throw new Error(`This PDF could not be unlocked${detail ? ` (${detail})` : ''}.`);
  }
  const out = new Uint8Array(qpdf.FS.readFile('/out.pdf'));
  qpdf.FS.unlink('/out.pdf');
  return out;
}

let currentPassword = '';

/** Run `fn` with `password` available to every PDF it opens. Calls are serialised. */
let queue: Promise<unknown> = Promise.resolve();
export function withPassword<T>(password: string | undefined, fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    currentPassword = password ?? '';
    try {
      return await fn();
    } finally {
      currentPassword = '';
    }
  });
  queue = run.catch(() => {});
  return run;
}

export async function unlockPdf(bytes: Uint8Array): Promise<{ bytes: Uint8Array; unlocked: boolean }> {
  if (!looksEncrypted(bytes)) return { bytes, unlocked: false };
  try {
    return { bytes: await decrypt(bytes, currentPassword), unlocked: true };
  } catch (e) {
    if (!(e instanceof PasswordRequiredError)) throw e;
    throw new Error(e.wrong ? 'That password did not open the PDF.' : 'This PDF is password-protected. Pass its password in the "password" argument.');
  }
}
