/**
 * A small baseline JPEG encoder for one-component (gray) images. Browsers only
 * write three-component JPEGs, which a PDF can't call DeviceGray, so the
 * grayscale PDF tool writes its own. The Huffman tables are built from the
 * image's own symbol counts (Annex K.2 of the JPEG standard), which also
 * makes the file smaller than the stock tables would.
 */

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31,
  39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

// Annex K.1 luminance quantisation table (natural order).
const BASE_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64,
  78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

// COS[u * 8 + x] = c(u) / 2 * cos((2x + 1) u pi / 16): one 1-D DCT row.
const COS = new Float64Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) COS[u * 8 + x] = ((u === 0 ? Math.SQRT1_2 : 1) / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16);

// Natural-order position -> zigzag index.
const ZIG_INDEX = new Int32Array(64);
ZIGZAG.forEach((pos, i) => (ZIG_INDEX[pos] = i));

interface Huff {
  bits: number[]; // bits[1..16]: how many codes of each length
  vals: number[]; // symbols in code order
  code: Int32Array; // per symbol
  size: Uint8Array;
}

function buildHuffman(freqIn: number[]): Huff {
  const freq = freqIn.slice();
  freq[256] = 1; // reserve one code so no real symbol gets the all-ones code
  const codesize = new Array<number>(257).fill(0);
  const others = new Array<number>(257).fill(-1);
  for (;;) {
    let c1 = -1;
    let v = Infinity;
    for (let i = 0; i <= 256; i++) if (freq[i]! > 0 && freq[i]! <= v) ((v = freq[i]!), (c1 = i));
    let c2 = -1;
    v = Infinity;
    for (let i = 0; i <= 256; i++) if (freq[i]! > 0 && freq[i]! <= v && i !== c1) ((v = freq[i]!), (c2 = i));
    if (c2 < 0) break;
    freq[c1] = freq[c1]! + freq[c2]!;
    freq[c2] = 0;
    codesize[c1]!++;
    while (others[c1]! >= 0) {
      c1 = others[c1]!;
      codesize[c1]!++;
    }
    others[c1] = c2;
    codesize[c2]!++;
    while (others[c2]! >= 0) {
      c2 = others[c2]!;
      codesize[c2]!++;
    }
  }
  const bits = new Array<number>(40).fill(0);
  for (let i = 0; i <= 256; i++) if (codesize[i]! > 0) bits[codesize[i]!]!++;
  for (let i = 39; i > 16; i--) {
    while (bits[i]! > 0) {
      let j = i - 2;
      while (bits[j] === 0) j--;
      bits[i] = bits[i]! - 2;
      bits[i - 1] = bits[i - 1]! + 1;
      bits[j + 1] = bits[j + 1]! + 2;
      bits[j] = bits[j]! - 1;
    }
  }
  let i = 16;
  while (bits[i] === 0) i--;
  bits[i] = bits[i]! - 1; // drop the reserved code
  const vals: number[] = [];
  for (let len = 1; len <= 39; len++) for (let s = 0; s < 256; s++) if (codesize[s] === len) vals.push(s);
  const code = new Int32Array(256);
  const size = new Uint8Array(256);
  let c = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let n = 0; n < bits[len]!; n++) {
      const s = vals[k++]!;
      code[s] = c++;
      size[s] = len;
    }
    c <<= 1;
  }
  return { bits: bits.slice(0, 17), vals, code, size };
}

class Bytes {
  buf = new Uint8Array(1 << 16);
  n = 0;
  push(...bs: number[]): void {
    for (const b of bs) {
      if (this.n === this.buf.length) {
        const g = new Uint8Array(this.buf.length * 2);
        g.set(this.buf);
        this.buf = g;
      }
      this.buf[this.n++] = b;
    }
  }
  u16(v: number): void {
    this.push(v >> 8, v & 255);
  }
}

function category(v: number): number {
  let a = Math.abs(v);
  let n = 0;
  while (a) {
    n++;
    a >>= 1;
  }
  return n;
}

/** Encode `gray` (width * height bytes, row-major) as a baseline grayscale JPEG. */
export function encodeGrayJpeg(gray: Uint8Array, width: number, height: number, quality = 90): Uint8Array {
  const q = Math.max(1, Math.min(100, quality));
  const scale = q < 50 ? 5000 / q : 200 - q * 2;
  const quant = BASE_QUANT.map((v) => Math.max(1, Math.min(255, Math.floor((v * scale + 50) / 100))));
  const bw = Math.ceil(width / 8);
  const bh = Math.ceil(height / 8);
  const coefs = new Int16Array(bw * bh * 64);
  const blk = new Float64Array(64);
  const tmp = new Float64Array(64);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < 8; y++) {
        const sy = Math.min(height - 1, by * 8 + y) * width;
        for (let x = 0; x < 8; x++) blk[y * 8 + x] = gray[sy + Math.min(width - 1, bx * 8 + x)]! - 128;
      }
      for (let y = 0; y < 8; y++) {
        for (let u = 0; u < 8; u++) {
          let s = 0;
          for (let x = 0; x < 8; x++) s += blk[y * 8 + x]! * COS[u * 8 + x]!;
          tmp[y * 8 + u] = s;
        }
      }
      const base = (by * bw + bx) * 64;
      for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
          let s = 0;
          for (let y = 0; y < 8; y++) s += tmp[y * 8 + u]! * COS[v * 8 + y]!;
          const pos = v * 8 + u;
          coefs[base + ZIG_INDEX[pos]!] = Math.round(s / quant[pos]!);
        }
      }
    }
  }
  const walk = (emitDc: (cat: number, diff: number) => void, emitAc: (sym: number, val: number, cat: number) => void): void => {
    let prev = 0;
    for (let b = 0; b < bw * bh; b++) {
      const o = b * 64;
      const diff = coefs[o]! - prev;
      prev = coefs[o]!;
      emitDc(category(diff), diff);
      let run = 0;
      for (let k = 1; k < 64; k++) {
        const v = coefs[o + k]!;
        if (v === 0) {
          run++;
          continue;
        }
        while (run > 15) {
          emitAc(0xf0, 0, 0);
          run -= 16;
        }
        const c = category(v);
        emitAc((run << 4) | c, v, c);
        run = 0;
      }
      if (run > 0) emitAc(0x00, 0, 0);
    }
  };
  const dcFreq = new Array<number>(257).fill(0);
  const acFreq = new Array<number>(257).fill(0);
  walk(
    (cat) => dcFreq[cat]!++,
    (sym) => acFreq[sym]!++,
  );
  const dc = buildHuffman(dcFreq);
  const ac = buildHuffman(acFreq);

  const out = new Bytes();
  out.u16(0xffd8);
  out.u16(0xffdb);
  out.u16(67);
  out.push(0);
  for (let i = 0; i < 64; i++) out.push(quant[ZIGZAG[i]!]!);
  out.u16(0xffc0);
  out.u16(11);
  out.push(8);
  out.u16(height);
  out.u16(width);
  out.push(1, 1, 0x11, 0);
  for (const [cls, h] of [
    [0x00, dc],
    [0x10, ac],
  ] as const) {
    out.u16(0xffc4);
    out.u16(2 + 1 + 16 + h.vals.length);
    out.push(cls);
    for (let i = 1; i <= 16; i++) out.push(h.bits[i]!);
    for (const v of h.vals) out.push(v);
  }
  out.u16(0xffda);
  out.u16(8);
  out.push(1, 1, 0x00, 0, 63, 0);

  let acc = 0;
  let nacc = 0;
  const put = (code: number, size: number): void => {
    if (size === 0) return;
    acc = (acc << size) | (code & ((1 << size) - 1));
    nacc += size;
    while (nacc >= 8) {
      const byte = (acc >> (nacc - 8)) & 255;
      out.push(byte);
      if (byte === 255) out.push(0);
      nacc -= 8;
    }
    acc &= (1 << nacc) - 1;
  };
  const bitsOf = (v: number, cat: number): number => (v < 0 ? v + (1 << cat) - 1 : v);
  walk(
    (cat, diff) => {
      put(dc.code[cat]!, dc.size[cat]!);
      put(bitsOf(diff, cat), cat);
    },
    (sym, val, cat) => {
      put(ac.code[sym]!, ac.size[sym]!);
      put(bitsOf(val, cat), cat);
    },
  );
  if (nacc > 0) put(0x7f, 8 - nacc);
  out.u16(0xffd9);
  return out.buf.slice(0, out.n);
}
