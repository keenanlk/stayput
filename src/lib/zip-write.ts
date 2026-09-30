/**
 * Writing ZIP files in the browser. Without a password fflate (MIT) packs the
 * files. With one, each file is deflated with fflate and encrypted with
 * AES-256 in the WinZip AE-2 format that 7-Zip, WinRAR, The Unarchiver and
 * libarchive read: a PBKDF2-HMAC-SHA1 key from the password and a random salt
 * (Web Crypto), AES in counter mode with a little-endian counter (AES blocks
 * from @noble/ciphers, MIT, because Web Crypto's AES-CTR counts big-endian),
 * and an HMAC-SHA1 code that lets the opener check the password and the data.
 */
import { deflateSync, zipSync, type Zippable } from 'fflate';
import { ecb } from '@noble/ciphers/aes.js';

export interface ZipEntry {
  /** Path inside the ZIP, folders separated by "/". */
  path: string;
  data: Uint8Array;
  modified?: Date;
}

/** Formats that are already compressed; deflating them again only costs time. */
const PACKED = /\.(jpe?g|png|gif|webp|avif|heic|heif|jxl|mp4|m4v|mov|webm|mkv|avi|mp3|m4a|aac|ogg|oga|opus|flac|zip|rar|7z|gz|tgz|bz2|xz|zst|docx|xlsx|pptx|odt|ods|odp|epub|apk|jar|woff2?)$/i;
export const worthDeflating = (path: string) => !PACKED.test(path);

/** Clean a path for a ZIP (forward slashes, no leading slash or dot folders) and make it unique in `taken`. */
export function zipPath(raw: string, taken: Set<string>): string {
  const parts = raw.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..');
  let path = parts.join('/') || 'file';
  if (taken.has(path.toLowerCase())) {
    const dot = path.lastIndexOf('.');
    const cut = dot > path.lastIndexOf('/') + 1 ? dot : path.length;
    for (let n = 2; taken.has(path.toLowerCase()); n++) path = `${parts.join('/').slice(0, cut)} (${n})${parts.join('/').slice(cut)}`;
  }
  taken.add(path.toLowerCase());
  return path;
}

/** A plain ZIP, deflating what is worth it and storing what is already compressed. */
export function plainZip(entries: ZipEntry[]): Uint8Array {
  const tree: Zippable = {};
  for (const e of entries) tree[e.path] = [e.data, { level: worthDeflating(e.path) ? 6 : 0, mtime: e.modified }];
  return zipSync(tree);
}

/**
 * AES-256 in counter mode with the counter as a little-endian number starting
 * at 1, as WinZip's AES format specifies.
 */
export function aesCtrLE(key: Uint8Array, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  const CHUNK = 1 << 20;
  const counters = new Uint8Array(Math.min(CHUNK, Math.ceil(data.length / 16) * 16));
  let n = 1;
  for (let off = 0; off < data.length; off += CHUNK) {
    const len = Math.min(CHUNK, data.length - off);
    const blocks = Math.ceil(len / 16);
    const buf = counters.subarray(0, blocks * 16);
    buf.fill(0);
    for (let b = 0; b < blocks; b++, n++) {
      let v = n;
      for (let k = 0; v > 0 && k < 8; k++) {
        buf[b * 16 + k] = v % 256;
        v = Math.floor(v / 256);
      }
    }
    const stream = ecb(key, { disablePadding: true }).encrypt(buf);
    for (let i = 0; i < len; i++) out[off + i] = data[off + i]! ^ stream[i]!;
  }
  return out;
}

/** The encryption key, authentication key and 2-byte password check, from PBKDF2-HMAC-SHA1 with 1000 rounds. */
export async function aesKeys(password: string, salt: Uint8Array): Promise<{ enc: Uint8Array; mac: Uint8Array; check: Uint8Array }> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-1', salt: salt as BufferSource, iterations: 1000 }, base, 66 * 8));
  return { enc: bits.slice(0, 32), mac: bits.slice(32, 64), check: bits.slice(64, 66) };
}

async function hmacSha1(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource));
}

/** MS-DOS time and date, the only timestamp every ZIP reader understands. */
function dosTime(d: Date): { time: number; date: number } {
  const y = Math.max(1980, Math.min(2107, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** A ZIP whose files are encrypted with AES-256 (WinZip AE-2). */
export async function encryptedZip(entries: ZipEntry[], password: string, onFile?: (done: number) => void): Promise<Uint8Array> {
  if (!password) throw new Error('A password is needed to encrypt the ZIP.');
  if (entries.length > 65535) throw new Error('A ZIP can hold at most 65,535 files. Split them into several ZIPs.');
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [i, e] of entries.entries()) {
    const deflated = worthDeflating(e.path) ? deflateSync(e.data, { level: 6 }) : undefined;
    const method = deflated && deflated.length < e.data.length ? 8 : 0;
    const plain = method === 8 ? deflated! : e.data;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keys = await aesKeys(password, salt);
    const cipher = aesCtrLE(keys.enc, plain);
    const auth = (await hmacSha1(keys.mac, cipher)).subarray(0, 10);
    const size = salt.length + 2 + cipher.length + 10;
    if (offset + size > 0xfffffff0) throw new Error('This ZIP would be over 4 GB, which needs a format most openers cannot read with a password. Split the files into several ZIPs.');
    const name = enc.encode(e.path);
    // AES extra field: AE-2, vendor "AE", strength 3 (256-bit), then the real compression method.
    const extra = new Uint8Array([0x01, 0x99, 7, 0, 2, 0, 0x41, 0x45, 3, method, 0]);
    const { time, date } = dosTime(e.modified ?? new Date());
    const local = new Uint8Array(30 + name.length + extra.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 51, true); // version 5.1: AES
    lv.setUint16(6, 0x0801, true); // encrypted, UTF-8 names
    lv.setUint16(8, 99, true); // AES
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, 0, true); // AE-2 leaves the CRC out; the HMAC checks the data instead
    lv.setUint32(18, size, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, extra.length, true);
    let p = 30;
    local.set(name, p);
    local.set(extra, (p += name.length));
    local.set(salt, (p += extra.length));
    local.set(keys.check, (p += 16));
    local.set(cipher, (p += 2));
    local.set(auth, p + cipher.length);
    locals.push(local);

    const head = new Uint8Array(46 + name.length + extra.length);
    const cv = new DataView(head.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 51, true);
    cv.setUint16(6, 51, true);
    cv.setUint16(8, 0x0801, true);
    cv.setUint16(10, 99, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, 0, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, extra.length, true);
    cv.setUint32(42, offset, true);
    head.set(name, 46);
    head.set(extra, 46 + name.length);
    central.push(head);
    offset += local.length;
    onFile?.(i + 1);
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + dirSize + 22);
  let at = 0;
  for (const part of [...locals, ...central, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
