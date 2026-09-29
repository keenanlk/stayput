/**
 * A small FLAC encoder: 16-bit PCM, one or two channels, fixed 4096-sample
 * blocks. Each channel of each block is stored as the best of a constant, a
 * fixed polynomial predictor (orders 0 to 4) with Rice-coded residuals, or the
 * raw samples. Browsers can decode FLAC but none can encode it, so this runs
 * in the page. Output is lossless: decoding gives back exactly the 16-bit
 * samples a WAV of the same audio would hold.
 */

const BLOCK = 4096;
const MAX_RICE = 14;

class BitWriter {
  buf = new Uint8Array(1 << 16);
  pos = 0; // bytes written
  acc = 0; // pending bits, at most 31
  n = 0;

  private grow(extra: number) {
    if (this.pos + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
  }

  /** Write the low `bits` bits of `value` (bits <= 24 per call keeps the accumulator safe). */
  write(value: number, bits: number) {
    if (bits > 24) {
      this.write(Math.floor(value / 0x1000000) & ((1 << (bits - 24)) - 1), bits - 24);
      this.write(value & 0xffffff, 24);
      return;
    }
    this.grow(4);
    this.acc = ((this.acc << bits) | (value & ((1 << bits) - 1))) >>> 0;
    this.n += bits;
    while (this.n >= 8) {
      this.n -= 8;
      this.buf[this.pos++] = (this.acc >>> this.n) & 0xff;
    }
    this.acc &= (1 << this.n) - 1;
  }

  /** `q` zero bits, then a one. */
  unary(q: number) {
    while (q >= 24) {
      this.write(0, 24);
      q -= 24;
    }
    this.write(1, q + 1);
  }

  signed(value: number, bits: number) {
    this.write(value < 0 ? value + 2 ** bits : value, bits);
  }

  align() {
    if (this.n) this.write(0, 8 - this.n);
  }

  bytes() {
    return this.buf.subarray(0, this.pos);
  }
}

const CRC8 = new Uint8Array(256);
const CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c8 = i;
  let c16 = i << 8;
  for (let b = 0; b < 8; b++) {
    c8 = c8 & 0x80 ? ((c8 << 1) ^ 0x07) & 0xff : (c8 << 1) & 0xff;
    c16 = c16 & 0x8000 ? ((c16 << 1) ^ 0x8005) & 0xffff : (c16 << 1) & 0xffff;
  }
  CRC8[i] = c8;
  CRC16[i] = c16;
}
const crc8 = (d: Uint8Array) => d.reduce((c, b) => CRC8[c ^ b]!, 0);
const crc16 = (d: Uint8Array) => d.reduce((c, b) => ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ b]!, 0);

/** Float samples to 16-bit integers, the same way the WAV writer does. */
export function toInt16(ch: Float32Array): Int32Array {
  const out = new Int32Array(ch.length);
  for (let i = 0; i < ch.length; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]!));
    out[i] = Math.trunc(s < 0 ? s * 0x8000 : s * 0x7fff);
  }
  return out;
}

/** Residuals of the fixed predictor of the given order, from sample `order` on. */
function residuals(x: Int32Array, order: number): Int32Array {
  const n = x.length;
  const r = new Int32Array(n - order);
  for (let i = order; i < n; i++) {
    let p = 0;
    if (order === 1) p = x[i - 1]!;
    else if (order === 2) p = 2 * x[i - 1]! - x[i - 2]!;
    else if (order === 3) p = 3 * x[i - 1]! - 3 * x[i - 2]! + x[i - 3]!;
    else if (order === 4) p = 4 * x[i - 1]! - 6 * x[i - 2]! + 4 * x[i - 3]! - x[i - 4]!;
    r[i - order] = x[i]! - p;
  }
  return r;
}

const zigzag = (v: number) => (v >= 0 ? v * 2 : -v * 2 - 1);

interface RicePlan { bits: number; order: number; params: number[] }

/** Cheapest Rice parameter for a run of residuals, and its cost in bits. */
function bestParam(u: Uint32Array, from: number, to: number): [number, number] {
  let sum = 0;
  for (let i = from; i < to; i++) sum += u[i]!;
  const n = to - from;
  const mean = n ? sum / n : 0;
  const guess = mean > 1 ? Math.min(MAX_RICE, Math.floor(Math.log2(mean))) : 0;
  let best: [number, number] = [0, Infinity];
  for (let k = Math.max(0, guess - 1); k <= Math.min(MAX_RICE, guess + 1); k++) {
    let bits = n * (k + 1);
    for (let i = from; i < to; i++) bits += u[i]! >>> k;
    if (bits < best[1]) best = [k, bits];
  }
  return best;
}

/** Try partition orders 0 to 6 and keep the cheapest. `total` is the block size; the residuals start after `order` warm-up samples. */
function planRice(r: Int32Array, total: number, predOrder: number): RicePlan {
  const u = new Uint32Array(r.length);
  for (let i = 0; i < r.length; i++) u[i] = zigzag(r[i]!);
  let best: RicePlan = { bits: Infinity, order: 0, params: [] };
  for (let p = 0; p <= 6; p++) {
    const parts = 1 << p;
    if (total % parts || total / parts <= predOrder) break;
    const size = total / parts;
    let bits = 2 + 4;
    const params: number[] = [];
    for (let j = 0; j < parts; j++) {
      const from = j === 0 ? 0 : j * size - predOrder;
      const to = (j + 1) * size - predOrder;
      const [k, cost] = bestParam(u, from, to);
      params.push(k);
      bits += 4 + cost;
    }
    if (bits < best.bits) best = { bits, order: p, params };
  }
  return best;
}

function writeSubframe(w: BitWriter, x: Int32Array) {
  const n = x.length;
  if (x.every((v) => v === x[0])) {
    w.write(0, 8); // pad, type 000000 (constant), no wasted bits
    w.signed(x[0]!, 16);
    return;
  }
  let best: { order: number; r: Int32Array; plan: RicePlan; bits: number } | null = null;
  for (let order = 0; order <= Math.min(4, n - 1); order++) {
    const r = residuals(x, order);
    const plan = planRice(r, n, order);
    const bits = order * 16 + plan.bits;
    if (!best || bits < best.bits) best = { order, r, plan, bits };
  }
  if (!best || best.bits >= n * 16) {
    w.write(0b00000010, 8); // verbatim
    for (let i = 0; i < n; i++) w.signed(x[i]!, 16);
    return;
  }
  const { order, r, plan } = best;
  w.write((0b001000 | order) << 1, 8);
  for (let i = 0; i < order; i++) w.signed(x[i]!, 16);
  w.write(0, 2); // Rice, 4-bit parameters
  w.write(plan.order, 4);
  const parts = 1 << plan.order;
  const size = n / parts;
  let at = 0;
  for (let j = 0; j < parts; j++) {
    const k = plan.params[j]!;
    w.write(k, 4);
    const count = j === 0 ? size - order : size;
    for (let i = 0; i < count; i++) {
      const v = zigzag(r[at++]!);
      w.unary(v >>> k);
      if (k) w.write(v & ((1 << k) - 1), k);
    }
  }
}

/** Frame numbers use the UTF-8 style variable-length code. */
function utf8Number(w: BitWriter, v: number) {
  if (v < 0x80) return w.write(v, 8);
  let n = 2;
  while (v >= 2 ** (5 * n + 1)) n++;
  const lead = (0xff << (8 - n)) & 0xff;
  w.write(lead | Math.floor(v / 2 ** (6 * (n - 1))), 8);
  for (let i = n - 2; i >= 0; i--) w.write(0x80 | (Math.floor(v / 2 ** (6 * i)) & 0x3f), 8);
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/** Encode one or two channels of float PCM as a FLAC file. `onProgress` gets 0 to 1. */
export async function encodeFlac(chans: Float32Array[], sampleRate: number, onProgress?: (f: number) => void): Promise<Blob> {
  const ints = chans.map(toInt16);
  const total = ints[0]!.length;
  const parts: BlobPart[] = [];

  const head = new BitWriter();
  for (const c of 'fLaC') head.write(c.charCodeAt(0), 8);
  head.write(0x80, 8); // last metadata block, STREAMINFO
  head.write(34, 24);
  head.write(BLOCK, 16);
  head.write(BLOCK, 16);
  head.write(0, 24); // min frame size unknown
  head.write(0, 24); // max frame size unknown
  head.write(sampleRate, 20);
  head.write(chans.length - 1, 3);
  head.write(15, 5); // 16 bits per sample
  head.write(Math.floor(total / 2 ** 32), 4);
  head.write(total >>> 0, 32);
  for (let i = 0; i < 16; i++) head.write(0, 8); // MD5 not computed
  parts.push(head.bytes().slice());

  let frame = 0;
  for (let start = 0; start < total; start += BLOCK, frame++) {
    const size = Math.min(BLOCK, total - start);
    const w = new BitWriter();
    w.write(0xfff8, 16); // sync, fixed block size
    w.write(size === BLOCK ? 0b1100 : 0b0111, 4);
    w.write(0, 4); // sample rate from STREAMINFO
    w.write(chans.length - 1, 4); // independent channels
    w.write(0b100, 3); // 16 bits
    w.write(0, 1);
    utf8Number(w, frame);
    if (size !== BLOCK) w.write(size - 1, 16);
    w.write(crc8(w.bytes()), 8);
    for (const ch of ints) writeSubframe(w, ch.subarray(start, start + size));
    w.align();
    w.write(crc16(w.bytes()), 16);
    parts.push(w.bytes().slice());
    if (frame % 64 === 63) {
      onProgress?.(Math.min(1, (start + size) / total));
      await yieldToUi();
    }
  }
  onProgress?.(1);
  return new Blob(parts, { type: 'audio/flac' });
}
