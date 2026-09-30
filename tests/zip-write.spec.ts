import { test, expect } from '@playwright/test';
import { createCipheriv, createHmac, pbkdf2Sync } from 'node:crypto';
import { inflateSync, unzipSync } from 'fflate';
import { aesCtrLE, encryptedZip, plainZip, zipPath } from '../src/lib/zip-write';

const text = (s: string) => new TextEncoder().encode(s);

/** Read an AE-2 entry back with Node's own crypto, independent of the code under test. */
function readAes(zip: Uint8Array, password: string) {
  const v = new DataView(zip.buffer, zip.byteOffset);
  const files: Record<string, string> = {};
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    expect(v.getUint16(p + 8, true)).toBe(99);
    const size = v.getUint32(p + 18, true);
    const nameLen = v.getUint16(p + 26, true);
    const extraLen = v.getUint16(p + 28, true);
    const name = new TextDecoder().decode(zip.subarray(p + 30, p + 30 + nameLen));
    const extra = zip.subarray(p + 30 + nameLen, p + 30 + nameLen + extraLen);
    expect([...extra.subarray(0, 9)]).toEqual([0x01, 0x99, 7, 0, 2, 0, 0x41, 0x45, 3]);
    const method = extra[9];
    const data = zip.subarray(p + 30 + nameLen + extraLen, p + 30 + nameLen + extraLen + size);
    const salt = data.subarray(0, 16);
    const keys = pbkdf2Sync(password, salt, 1000, 66, 'sha1');
    expect([...data.subarray(16, 18)]).toEqual([...keys.subarray(64, 66)]);
    const cipher = data.subarray(18, data.length - 10);
    const mac = createHmac('sha1', keys.subarray(32, 64)).update(cipher).digest().subarray(0, 10);
    expect([...data.subarray(data.length - 10)]).toEqual([...mac]);
    const counters = Buffer.alloc(Math.ceil(cipher.length / 16) * 16);
    for (let b = 0; b < counters.length / 16; b++) counters.writeUInt32LE(b + 1, b * 16);
    const ecb = createCipheriv('aes-256-ecb', keys.subarray(0, 32), null).setAutoPadding(false);
    const stream = Buffer.concat([ecb.update(counters), ecb.final()]);
    const plain = cipher.map((c, i) => c ^ stream[i]!);
    files[name] = new TextDecoder().decode(method === 8 ? inflateSync(plain) : plain);
    p += 30 + nameLen + extraLen + size;
  }
  expect(v.getUint32(p, true)).toBe(0x02014b50);
  return files;
}

test('encryptedZip writes WinZip AES-256 entries that decrypt with the password and pass their HMAC', async () => {
  const long = 'The tide came in over the flats. '.repeat(400);
  const zip = await encryptedZip(
    [
      { path: 'notes/tide.txt', data: text(long) },
      { path: 'photo.jpg', data: text('not really a jpeg, stored as is') },
      { path: 'café.txt', data: text('ünïcode') },
    ],
    'tide-pool',
  );
  expect(new TextDecoder('latin1').decode(zip).includes('The tide came')).toBe(false);
  const files = readAes(zip, 'tide-pool');
  expect(files).toEqual({ 'notes/tide.txt': long, 'photo.jpg': 'not really a jpeg, stored as is', 'café.txt': 'ünïcode' });
});

test('aesCtrLE counts little-endian across its internal chunks', () => {
  const key = new Uint8Array(32).fill(7);
  const data = new Uint8Array((1 << 20) + 100).map((_, i) => i % 251);
  const ours = aesCtrLE(key, data);
  const counters = Buffer.alloc(Math.ceil(data.length / 16) * 16);
  for (let b = 0; b < counters.length / 16; b++) counters.writeUInt32LE(b + 1, b * 16);
  const ecb = createCipheriv('aes-256-ecb', key, null).setAutoPadding(false);
  const stream = Buffer.concat([ecb.update(counters), ecb.final()]);
  expect(Buffer.from(ours).equals(Buffer.from(data.map((d, i) => d ^ stream[i]!)))).toBe(true);
});

test('plainZip round-trips files and keeps folders', () => {
  const zip = plainZip([
    { path: 'a/b.txt', data: text('hello') },
    { path: 'c.png', data: text('png bytes') },
  ]);
  const back = unzipSync(zip);
  expect(Object.keys(back).sort()).toEqual(['a/b.txt', 'c.png']);
  expect(new TextDecoder().decode(back['a/b.txt'])).toBe('hello');
});

test('zipPath cleans paths and numbers duplicates', () => {
  const taken = new Set<string>();
  expect(zipPath('/trip/../photo.jpg', taken)).toBe('trip/photo.jpg');
  expect(zipPath('trip\\photo.jpg', taken)).toBe('trip/photo (2).jpg');
  expect(zipPath('Trip/Photo.JPG', taken)).toBe('Trip/Photo (3).JPG');
  expect(zipPath('README', taken)).toBe('README');
  expect(zipPath('README', taken)).toBe('README (2)');
});
