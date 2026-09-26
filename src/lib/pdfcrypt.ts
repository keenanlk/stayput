/**
 * Cryptographic primitives for the PDF standard security handler, written
 * out in TypeScript so nothing here depends on a server or a native module.
 * WebCrypto provides SHA-2, but not MD5, RC4 or unpadded AES, which older
 * and current PDF encryption revisions need, so those are implemented here.
 * Everything operates on Uint8Arrays in memory.
 */

/* ------------------------------------------------------------------ */
/* Bytes                                                               */
/* ------------------------------------------------------------------ */
export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
/** PDFDocEncoding is close enough to Latin-1 for password bytes (revisions 2 to 4). */
export const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/* ------------------------------------------------------------------ */
/* SHA-2 via WebCrypto                                                 */
/* ------------------------------------------------------------------ */
export async function sha(bits: 256 | 384 | 512, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(`SHA-${bits}`, data as BufferSource));
}

/* ------------------------------------------------------------------ */
/* MD5 (RFC 1321)                                                      */
/* ------------------------------------------------------------------ */
const MD5_K = new Uint32Array(64);
for (let i = 0; i < 64; i++) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32);
const MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];

export function md5(data: Uint8Array): Uint8Array {
  const len = data.length;
  const padded = new Uint8Array(((len + 8) >> 6 << 6) + 64);
  padded.set(data);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, (len * 8) >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor((len * 8) / 2 ** 32), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) m[i] = dv.getUint32(off + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const t = d;
      d = c;
      c = b;
      const x = (a + f + MD5_K[i]! + m[g]!) >>> 0;
      b = (b + ((x << MD5_S[i]!) | (x >>> (32 - MD5_S[i]!)))) >>> 0;
      a = t;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, a0, true);
  ov.setUint32(4, b0, true);
  ov.setUint32(8, c0, true);
  ov.setUint32(12, d0, true);
  return out;
}

/* ------------------------------------------------------------------ */
/* RC4                                                                 */
/* ------------------------------------------------------------------ */
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 0xff;
    const t = s[i]!;
    s[i] = s[j]!;
    s[j] = t;
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]!) & 0xff;
    const t = s[i]!;
    s[i] = s[j]!;
    s[j] = t;
    out[k] = data[k]! ^ s[(s[i]! + s[j]!) & 0xff]!;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* AES (FIPS 197): 128 and 256 bit keys, block encrypt and decrypt     */
/* ------------------------------------------------------------------ */
const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
{
  // Generate the S-box from the multiplicative inverse in GF(2^8).
  let p = 1;
  let q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]!] = i;
}
const xtime = (x: number) => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
const mul = (a: number, b: number) => {
  let r = 0;
  while (b) {
    if (b & 1) r ^= a;
    a = xtime(a);
    b >>= 1;
  }
  return r;
};

function expandKey(key: Uint8Array): Uint8Array[] {
  const nk = key.length / 4;
  if (nk !== 4 && nk !== 6 && nk !== 8) throw new Error('AES key must be 16, 24 or 32 bytes.');
  const rounds = nk + 6;
  const w = new Uint8Array(16 * (rounds + 1));
  w.set(key);
  let rcon = 1;
  for (let i = nk; i < 4 * (rounds + 1); i++) {
    const t = w.slice((i - 1) * 4, i * 4);
    if (i % nk === 0) {
      const first = t[0]!;
      t[0] = SBOX[t[1]!]! ^ rcon;
      t[1] = SBOX[t[2]!]!;
      t[2] = SBOX[t[3]!]!;
      t[3] = SBOX[first]!;
      rcon = xtime(rcon);
    } else if (nk > 6 && i % nk === 4) {
      for (let j = 0; j < 4; j++) t[j] = SBOX[t[j]!]!;
    }
    for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - nk) * 4 + j]! ^ t[j]!;
  }
  const roundKeys: Uint8Array[] = [];
  for (let r = 0; r <= rounds; r++) roundKeys.push(w.subarray(r * 16, r * 16 + 16));
  return roundKeys;
}

function encryptBlock(rk: Uint8Array[], block: Uint8Array): Uint8Array {
  const s = new Uint8Array(block);
  const rounds = rk.length - 1;
  for (let i = 0; i < 16; i++) s[i]! ^= rk[0]![i]!;
  for (let r = 1; r <= rounds; r++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]!]!;
    // ShiftRows: row r (bytes r, r+4, r+8, r+12) rotates left by r.
    for (let row = 1; row < 4; row++) {
      const t = [s[row]!, s[row + 4]!, s[row + 8]!, s[row + 12]!];
      for (let c = 0; c < 4; c++) s[row + c * 4] = t[(c + row) % 4]!;
    }
    if (r !== rounds) {
      for (let c = 0; c < 4; c++) {
        const a0 = s[c * 4]!;
        const a1 = s[c * 4 + 1]!;
        const a2 = s[c * 4 + 2]!;
        const a3 = s[c * 4 + 3]!;
        s[c * 4] = mul(a0, 2) ^ mul(a1, 3) ^ a2 ^ a3;
        s[c * 4 + 1] = a0 ^ mul(a1, 2) ^ mul(a2, 3) ^ a3;
        s[c * 4 + 2] = a0 ^ a1 ^ mul(a2, 2) ^ mul(a3, 3);
        s[c * 4 + 3] = mul(a0, 3) ^ a1 ^ a2 ^ mul(a3, 2);
      }
    }
    for (let i = 0; i < 16; i++) s[i]! ^= rk[r]![i]!;
  }
  return s;
}

function decryptBlock(rk: Uint8Array[], block: Uint8Array): Uint8Array {
  const s = new Uint8Array(block);
  const rounds = rk.length - 1;
  for (let i = 0; i < 16; i++) s[i]! ^= rk[rounds]![i]!;
  for (let r = rounds - 1; r >= 0; r--) {
    for (let row = 1; row < 4; row++) {
      const t = [s[row]!, s[row + 4]!, s[row + 8]!, s[row + 12]!];
      for (let c = 0; c < 4; c++) s[row + c * 4] = t[(c - row + 4) % 4]!;
    }
    for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]!]!;
    for (let i = 0; i < 16; i++) s[i]! ^= rk[r]![i]!;
    if (r !== 0) {
      for (let c = 0; c < 4; c++) {
        const a0 = s[c * 4]!;
        const a1 = s[c * 4 + 1]!;
        const a2 = s[c * 4 + 2]!;
        const a3 = s[c * 4 + 3]!;
        s[c * 4] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
        s[c * 4 + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
        s[c * 4 + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
        s[c * 4 + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
      }
    }
  }
  return s;
}

/** AES-CBC without padding; the input length must be a multiple of 16. */
export function aesCbcEncryptRaw(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length % 16) throw new Error('AES-CBC input must be a multiple of 16 bytes.');
  const rk = expandKey(key);
  const out = new Uint8Array(data.length);
  let prev = iv;
  for (let o = 0; o < data.length; o += 16) {
    const block = new Uint8Array(16);
    for (let i = 0; i < 16; i++) block[i] = data[o + i]! ^ prev[i]!;
    const enc = encryptBlock(rk, block);
    out.set(enc, o);
    prev = enc;
  }
  return out;
}

export function aesCbcDecryptRaw(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const rk = expandKey(key);
  const usable = data.length - (data.length % 16);
  const out = new Uint8Array(usable);
  let prev = iv;
  for (let o = 0; o < usable; o += 16) {
    const block = data.subarray(o, o + 16);
    const dec = decryptBlock(rk, block);
    for (let i = 0; i < 16; i++) out[o + i] = dec[i]! ^ prev[i]!;
    prev = block;
  }
  return out;
}

/** AES-CBC as PDF uses it for strings and streams: random IV first, PKCS#5 padding. */
export function aesCbcEncrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  const iv = randomBytes(16);
  const pad = 16 - (data.length % 16);
  const padded = new Uint8Array(data.length + pad);
  padded.set(data);
  padded.fill(pad, data.length);
  return concat(iv, aesCbcEncryptRaw(key, iv, padded));
}

export function aesCbcDecrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < 32) return new Uint8Array(0);
  const plain = aesCbcDecryptRaw(key, data.subarray(0, 16), data.subarray(16));
  const pad = plain[plain.length - 1]!;
  // Tolerate files with bad padding rather than failing the whole document.
  return pad >= 1 && pad <= 16 ? plain.subarray(0, plain.length - pad) : plain;
}

/** AES-ECB of a single block with no padding (used for /Perms). */
export function aesEcbBlock(key: Uint8Array, block: Uint8Array, decrypt = false): Uint8Array {
  const rk = expandKey(key);
  return decrypt ? decryptBlock(rk, block) : encryptBlock(rk, block);
}
