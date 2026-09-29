/**
 * A QR code encoder (ISO/IEC 18004), written for this site so the text never
 * leaves the page: byte mode (UTF-8), versions 1 to 40, all four error
 * correction levels, and the mask with the lowest penalty score. The layout
 * follows the standard as Project Nayuki's reference encoder explains it.
 */

export type Ecc = 'L' | 'M' | 'Q' | 'H';

const ECC_INDEX: Record<Ecc, number> = { L: 0, M: 1, Q: 2, H: 3 };
const FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

// prettier-ignore
const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
// prettier-ignore
const BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/** Modules available for data and error correction in a version. */
function rawModules(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

const dataCodewords = (ver: number, ecc: Ecc) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ECC_INDEX[ecc]]![ver]! * BLOCKS[ECC_INDEX[ecc]]![ver]!;

/** Bytes that fit in a version at a level, in byte mode. */
export function capacity(ver: number, ecc: Ecc): number {
  const countBits = ver <= 9 ? 8 : 16;
  return Math.floor((dataCodewords(ver, ecc) * 8 - 4 - countBits) / 8);
}

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < degree) result[j]! ^= result[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i]! ^= gfMul(divisor[i]!, factor);
  }
  return result;
}

export interface QrCode {
  version: number;
  ecc: Ecc;
  mask: number;
  size: number;
  /** modules[y][x], true for dark. */
  modules: boolean[][];
}

export class QrTooLong extends Error {}

/** Encode text (as UTF-8) at the given level, in the smallest version it fits. */
export function encodeQr(text: string, ecc: Ecc = 'M'): QrCode {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  while (ver <= 40 && capacity(ver, ecc) < bytes.length) ver++;
  if (ver > 40) throw new QrTooLong(`Too long for a QR code: ${bytes.length} bytes, and the most that fits at this error correction level is ${capacity(40, ecc)}.`);

  // Data bits: byte mode, length, the bytes, a terminator, then padding.
  const bits: number[] = [];
  const put = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  };
  put(0x4, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capBits = dataCodewords(ver, ecc) * 8;
  put(0, Math.min(4, capBits - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Split into blocks, add Reed-Solomon codewords to each, and interleave.
  const numBlocks = BLOCKS[ECC_INDEX[ecc]]![ver]!;
  const eccLen = ECC_PER_BLOCK[ECC_INDEX[ecc]]![ver]!;
  const raw = Math.floor(rawModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const rem = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push([...dat, ...rem]);
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortLen - eccLen || j >= numShort) codewords.push(blocks[j]![i]!);
    }
  }

  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    modules[y]![x] = dark;
    fixed[y]![x] = true;
  };

  // Timing lines, finders, alignment patterns.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const align = alignmentPositions(ver);
  const n = align.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(align[i]! + dx, align[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  const drawFormat = (mask: number) => {
    const d = (FORMAT_BITS[ecc] << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0); // reserves the format areas
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((v >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // Codewords in the zigzag order, two columns at a time from the bottom right.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fixed[y]![x] && i < codewords.length * 8) {
          modules[y]![x] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

  // Try all eight masks and keep the one with the lowest penalty.
  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!fixed[y]![x] && MASKS[mask]!(x, y)) modules[y]![x] = !modules[y]![x];
      }
    }
  };
  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const score = penalty(modules);
    if (score < bestScore) {
      best = m;
      bestScore = score;
    }
    applyMask(m); // undo
  }
  applyMask(best);
  drawFormat(best);
  return { version: ver, ecc, mask: best, size, modules };
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 17 - 7; result.length < n; pos -= step) result.splice(1, 0, pos);
  return result;
}

const FINDER_LIKE = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
];

/** The standard's mask penalty: runs, 2×2 blocks, finder-like patterns and dark balance. */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  const at = (x: number, y: number, vertical: boolean) => (vertical ? m[x]![y]! : m[y]![x]!);
  for (const vertical of [false, true]) {
    for (let y = 0; y < size; y++) {
      let run = 1;
      for (let x = 1; x <= size; x++) {
        if (x < size && at(x, y, vertical) === at(x - 1, y, vertical)) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      for (let x = 0; x + 11 <= size; x++) {
        for (const pat of FINDER_LIKE) {
          if (pat.every((v, k) => at(x + k, y, vertical) === v)) score += 40;
        }
      }
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (m[y]![x]) dark++;
      if (x + 1 < size && y + 1 < size) {
        const c = m[y]![x];
        if (m[y]![x + 1] === c && m[y + 1]![x] === c && m[y + 1]![x + 1] === c) score += 3;
      }
    }
  }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** An SVG of the code, one path for the dark modules, with `margin` light modules around it. */
export function qrSvg(qr: QrCode, opts: { margin: number; dark: string; light: string | null }): string {
  const { margin } = opts;
  const dim = qr.size + margin * 2;
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) if (qr.modules[y]![x]) d += `M${x + margin},${y + margin}h1v1h-1z`;
  }
  const bg = opts.light ? `<rect width="${dim}" height="${dim}" fill="${opts.light}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">${bg}<path d="${d}" fill="${opts.dark}"/></svg>`;
}

/** Draw the code on a canvas `px` pixels square (rounded down to whole pixels per module when it can be). */
export function drawQr(canvas: HTMLCanvasElement, qr: QrCode, opts: { px: number; margin: number; dark: string; light: string | null }) {
  const dim = qr.size + opts.margin * 2;
  const scale = opts.px / dim;
  canvas.width = opts.px;
  canvas.height = opts.px;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, opts.px, opts.px);
  if (opts.light) {
    ctx.fillStyle = opts.light;
    ctx.fillRect(0, 0, opts.px, opts.px);
  }
  ctx.fillStyle = opts.dark;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y]![x]) continue;
      // Snap edges to whole pixels so neighbouring modules meet without hairline gaps.
      const x0 = Math.round((x + opts.margin) * scale);
      const y0 = Math.round((y + opts.margin) * scale);
      const x1 = Math.round((x + 1 + opts.margin) * scale);
      const y1 = Math.round((y + 1 + opts.margin) * scale);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

/** Escape a value for a Wi-Fi QR payload (backslash before \ ; , : and "). */
const wifiEscape = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

export function wifiPayload(o: { ssid: string; password: string; security: 'WPA' | 'WEP' | 'nopass'; hidden: boolean }): string {
  const pass = o.security === 'nopass' ? '' : `P:${wifiEscape(o.password)};`;
  return `WIFI:T:${o.security};S:${wifiEscape(o.ssid)};${pass}${o.hidden ? 'H:true;' : ''};`;
}

const vEscape = (s: string) => s.replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');

export function vcardPayload(o: { first: string; last: string; phone: string; email: string; org: string; title: string; url: string }): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEscape(o.last)};${vEscape(o.first)};;;`, `FN:${vEscape([o.first, o.last].filter(Boolean).join(' '))}`];
  if (o.org) lines.push(`ORG:${vEscape(o.org)}`);
  if (o.title) lines.push(`TITLE:${vEscape(o.title)}`);
  if (o.phone) lines.push(`TEL;TYPE=CELL:${o.phone}`);
  if (o.email) lines.push(`EMAIL:${o.email}`);
  if (o.url) lines.push(`URL:${o.url}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function emailPayload(o: { to: string; subject: string; body: string }): string {
  const q = [o.subject && `subject=${encodeURIComponent(o.subject)}`, o.body && `body=${encodeURIComponent(o.body)}`].filter(Boolean).join('&');
  return `mailto:${o.to}${q ? `?${q}` : ''}`;
}
