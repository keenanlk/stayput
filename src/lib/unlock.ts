/**
 * Encrypted PDFs. Many PDFs carry "owner" encryption with an empty user
 * password (bank statements, government forms, anything exported with
 * printing restrictions). They open in every viewer, but pdf-lib cannot
 * decrypt, so editing one used to write its encrypted streams into an
 * unencrypted file: a document that looked fine in the results list and was
 * blank or broken when opened.
 *
 * The fix runs qpdf (compiled to WebAssembly, Apache-2.0) inside the tab to
 * strip the encryption first. Like the HEIC decoder it is served from this
 * site's /vendor/ directory, fetched only when an encrypted PDF is dropped
 * (and then cached for offline use), and only the program is downloaded: the
 * PDF never leaves the tab. Files that need a user password prompt for it
 * once; the outputs are written without encryption.
 */
import { vendorDir } from './vendor';

interface QpdfModule {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  callMain(args: string[]): number;
}
type QpdfFactory = (opts: { locateFile: (file: string) => string; noInitialRun?: boolean }) => Promise<QpdfModule>;

declare global {
  interface Window {
    Module?: unknown;
  }
}

let factoryPromise: Promise<QpdfFactory> | undefined;

/** Load the qpdf script (a classic UMD bundle) and return its module factory. */
function loadFactory(): Promise<QpdfFactory> {
  if (!factoryPromise) {
    factoryPromise = new Promise<QpdfFactory>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${vendorDir('qpdf')}qpdf.js`;
      script.async = true;
      script.onload = () => {
        const factory = window.Module as QpdfFactory | undefined;
        // The bundle declares a global `var Module`, which cannot be deleted; clear it instead.
        window.Module = undefined;
        script.remove();
        if (typeof factory !== 'function') reject(new Error('The PDF unlock engine did not initialise.'));
        else resolve(factory);
      };
      script.onerror = () => {
        script.remove();
        reject(new Error('The PDF unlock engine could not be loaded. Check your connection and try again.'));
      };
      document.head.append(script);
    }).catch((err) => {
      factoryPromise = undefined;
      throw err;
    });
  }
  return factoryPromise;
}

/**
 * Cheap check for an /Encrypt entry in the file's trailer. Trailers live at
 * the end of the file, or at the start in linearized files, so both ends are
 * searched. False positives only cost one qpdf pass, which is a no-op.
 */
export function looksEncrypted(bytes: Uint8Array): boolean {
  const needle = '/Encrypt';
  const window_ = 65536;
  const td = new TextDecoder('latin1');
  const tail = td.decode(bytes.subarray(Math.max(0, bytes.length - window_)));
  if (tail.includes(needle)) return true;
  if (bytes.length > window_) {
    const head = td.decode(bytes.subarray(0, window_));
    if (head.includes(needle)) return true;
  }
  return false;
}

export class PasswordRequiredError extends Error {
  constructor(public readonly wrong: boolean) {
    super(wrong ? 'That password did not open the PDF.' : 'This PDF needs a password to open.');
    this.name = 'PasswordRequiredError';
  }
}

/*
 * One qpdf instance is created per page and reused: creating a second one
 * refetches the wasm, and the bundle binds its stderr to console.error at
 * creation, so a wrapper installed then lets each run collect its own
 * messages (qpdf reports a wrong password only on stderr).
 */
let modulePromise: Promise<QpdfModule> | undefined;
let sink: string[] | null = null;

function loadModule(): Promise<QpdfModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const factory = await loadFactory();
      const original = console.error;
      console.error = (...args: unknown[]) => {
        if (sink) sink.push(args.map(String).join(' '));
        else original(...args);
      };
      try {
        return await factory({ locateFile: (file) => `${vendorDir('qpdf')}${file}`, noInitialRun: true });
      } finally {
        console.error = original;
      }
    })().catch((err) => {
      modulePromise = undefined;
      throw err;
    });
  }
  return modulePromise;
}

/** Run qpdf on `bytes` with `args` between the input and output paths; returns the output and qpdf's stderr. */
async function runQpdf(bytes: Uint8Array, args: string[]): Promise<{ code: number; stderr: string; out?: Uint8Array }> {
  const qpdf = await loadModule();
  const messages: string[] = [];
  qpdf.FS.writeFile('/in.pdf', bytes);
  let code: number;
  sink = messages;
  try {
    code = qpdf.callMain([...args, '/in.pdf', '/out.pdf']);
  } catch (e) {
    code = typeof e === 'object' && e && 'status' in e ? Number((e as { status: unknown }).status) : 1;
  } finally {
    sink = null;
    try {
      qpdf.FS.unlink('/in.pdf');
    } catch {
      /* already gone */
    }
  }
  const stderr = messages.join('\n');
  // qpdf exits 3 for "succeeded with warnings", which still writes a usable file.
  if (code !== 0 && code !== 3) return { code, stderr };
  const out = qpdf.FS.readFile('/out.pdf');
  // Copy out of the wasm heap, then free the file inside it.
  const copy = new Uint8Array(out);
  qpdf.FS.unlink('/out.pdf');
  return { code, stderr, out: copy };
}

function lastLine(stderr: string): string | undefined {
  return stderr.trim().split('\n').pop()?.replace(/^this\.program:\s*(\/in\.pdf:\s*)?/, '');
}

/** Run `qpdf --decrypt`. Throws PasswordRequiredError when a user password is needed or wrong. */
export async function decryptPdf(bytes: Uint8Array, password = ''): Promise<Uint8Array> {
  const { stderr, out } = await runQpdf(bytes, ['--decrypt', ...(password ? [`--password=${password}`] : [])]);
  if (!out) {
    if (/invalid password/i.test(stderr)) throw new PasswordRequiredError(password !== '');
    const detail = lastLine(stderr);
    throw new Error(`This PDF could not be unlocked${detail ? ` (${detail})` : ''}.`);
  }
  return out;
}

/**
 * Encrypt with AES-256 (PDF 2.0 security handler, readable by every current
 * viewer). The same password opens the file and grants full permissions, so
 * nothing is restricted once it is open.
 */
export async function encryptPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (!password) throw new Error('Enter a password to protect the PDF with.');
  const { stderr, out } = await runQpdf(bytes, ['--encrypt', `--user-password=${password}`, `--owner-password=${password}`, '--bits=256', '--']);
  if (!out) {
    const detail = lastLine(stderr);
    throw new Error(`This PDF could not be protected${detail ? ` (${detail})` : ''}.`);
  }
  return out;
}

/* Remember decrypted results per file so the password is asked once. */
const cache = new Map<string, Uint8Array>();
const passwords = new Map<string, string>();

function fingerprint(bytes: Uint8Array): string {
  // FNV-1a over the first and last 4 KB plus the length: cheap and good enough to recognise the same drop.
  let h = 0x811c9dc5;
  const mix = (b: number) => {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const n = Math.min(4096, bytes.length);
  for (let i = 0; i < n; i++) mix(bytes[i]!);
  for (let i = Math.max(n, bytes.length - 4096); i < bytes.length; i++) mix(bytes[i]!);
  return `${bytes.length}:${h.toString(16)}`;
}

export interface UnlockOptions {
  /** Ask the user for a password. Return undefined to give up. Defaults to window.prompt. */
  askPassword?: (attempt: number) => string | undefined;
}

/**
 * Return bytes pdf-lib and pdf.js can both read: the file itself when it is
 * not encrypted, otherwise a decrypted copy (prompting for a password when
 * the file needs one).
 */
export async function unlockPdf(bytes: Uint8Array, opts: UnlockOptions = {}): Promise<{ bytes: Uint8Array; unlocked: boolean }> {
  if (!looksEncrypted(bytes)) return { bytes, unlocked: false };
  const key = fingerprint(bytes);
  const hit = cache.get(key);
  if (hit) return { bytes: hit, unlocked: true };
  const ask = opts.askPassword ?? defaultAsk;
  let password = passwords.get(key) ?? '';
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await decryptPdf(bytes, password);
      if (cache.size > 8) cache.delete(cache.keys().next().value!);
      cache.set(key, out);
      if (password) passwords.set(key, password);
      return { bytes: out, unlocked: true };
    } catch (e) {
      if (!(e instanceof PasswordRequiredError)) throw e;
      const next = ask(attempt);
      if (!next) throw new Error('This PDF is password-protected. Enter its password to open it, or remove the password in the app that created it.');
      password = next;
    }
  }
}

function defaultAsk(attempt: number): string | undefined {
  const text = attempt === 0 ? 'This PDF is password-protected. Enter its password to open it here (it is checked in your browser and never sent anywhere).' : 'That password did not work. Try again:';
  return window.prompt(text, '')?.trim() || undefined;
}
