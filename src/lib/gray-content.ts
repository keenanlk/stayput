/**
 * Colour maths and a content-stream rewriter for the grayscale PDF tool.
 *
 * `rewriteContent` walks the operators of one PDF content stream and turns
 * every colour operator into DeviceGray, copying every other byte (text,
 * paths, marked content) through untouched. It knows nothing about pdf-lib:
 * the caller says what a colour space name means and what to do when a
 * stream draws a form, a pattern or a shading.
 */

/** A colour space as far as this tool cares. */
export type ColorSpace =
  | { kind: 'gray' }
  | { kind: 'rgb' }
  | { kind: 'cmyk' }
  /** Palette entries already converted to one gray byte each. */
  | { kind: 'indexed'; hival: number; gray: Uint8Array }
  /** `base` is set for uncoloured patterns, which this tool leaves to the overlay. */
  | { kind: 'pattern'; base?: ColorSpace }
  /** Separation, DeviceN, Lab and anything else that can't be mapped to gray here. */
  | { kind: 'bad' };

/** Luminance of an RGB triple in 0..1. */
export function rgbToGray(r: number, g: number, b: number): number {
  return clamp01(0.299 * r + 0.587 * g + 0.114 * b);
}

/**
 * CMYK to gray with the PostScript conversion (1 - min(1, 0.3C + 0.59M + 0.11Y + K)).
 * Plain K maps to exactly 1 - K, so black text stays black, and it is
 * monotonic, which a CMYK -> RGB -> Y detour with a fixed matrix is not.
 */
export function cmykToGray(c: number, m: number, y: number, k: number): number {
  return clamp01(1 - Math.min(1, 0.3 * clamp01(c) + 0.59 * clamp01(m) + 0.11 * clamp01(y) + clamp01(k)));
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function fmt(v: number): string {
  const s = v.toFixed(4);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

export interface ContentEnv {
  /** Resolve a name from the stream's /ColorSpace resources. */
  colorSpace(name: string): ColorSpace;
  /** `Do`: a form XObject (recurse) or an image (check it was converted). */
  xobject(name: string): void;
  shading(name: string): void;
  pattern(name: string): void;
  extGState(name: string): void;
  font(name: string): void;
  /** Colour we can't rewrite was found in this stream. */
  unconvertible(reason: string): void;
  /** Convert pixels of an inline image to 8-bit gray, or null when it can't be done. */
  inlineImage(info: InlineImage): Uint8Array | null;
}

export interface InlineImage {
  width: number;
  height: number;
  /** Source colour space: 'rgb' or 'cmyk'. */
  space: 'rgb' | 'cmyk';
  /** Filter names as written (e.g. Fl), empty when the data is raw. */
  filters: string[];
  hasDecodeParms: boolean;
  data: Uint8Array;
}

type Tok =
  | { t: 'num'; v: number; s: number; e: number }
  | { t: 'name'; v: string; s: number; e: number }
  | { t: 'op'; v: string; s: number; e: number }
  | { t: 'arr'; items: Tok[]; s: number; e: number }
  | { t: 'other'; s: number; e: number };

const WS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of '()<>[]{}/%') DELIM[c.charCodeAt(0)] = 1;

class Lexer {
  pos = 0;
  constructor(readonly b: Uint8Array) {}

  skipSpace(): void {
    const b = this.b;
    while (this.pos < b.length) {
      const c = b[this.pos]!;
      if (WS[c]) this.pos++;
      else if (c === 0x25) {
        while (this.pos < b.length && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
      } else break;
    }
  }

  next(): Tok | null {
    this.skipSpace();
    const b = this.b;
    if (this.pos >= b.length) return null;
    const s = this.pos;
    const c = b[s]!;
    if (c === 0x2f) {
      this.pos++;
      while (this.pos < b.length && !WS[b[this.pos]!] && !DELIM[b[this.pos]!]) this.pos++;
      return { t: 'name', v: decodeName(b.subarray(s + 1, this.pos)), s, e: this.pos };
    }
    if (c === 0x28) {
      let depth = 0;
      while (this.pos < b.length) {
        const d = b[this.pos++]!;
        if (d === 0x5c) this.pos++;
        else if (d === 0x28) depth++;
        else if (d === 0x29 && --depth === 0) break;
      }
      return { t: 'other', s, e: this.pos };
    }
    if (c === 0x3c) {
      if (b[s + 1] === 0x3c) {
        this.pos += 2;
        let depth = 1;
        while (depth > 0) {
          const t = this.next();
          if (!t) break;
          if (t.t === 'op' && t.v === '<<') depth++;
          else if (t.t === 'op' && t.v === '>>') depth--;
        }
        return { t: 'other', s, e: this.pos };
      }
      while (this.pos < b.length && b[this.pos] !== 0x3e) this.pos++;
      this.pos++;
      return { t: 'other', s, e: this.pos };
    }
    if (c === 0x3e) {
      this.pos += b[s + 1] === 0x3e ? 2 : 1;
      return { t: 'op', v: '>>', s, e: this.pos };
    }
    if (c === 0x5b) {
      this.pos++;
      const items: Tok[] = [];
      for (;;) {
        this.skipSpace();
        if (this.pos >= b.length) break;
        if (b[this.pos] === 0x5d) {
          this.pos++;
          break;
        }
        const t = this.next();
        if (!t) break;
        items.push(t);
      }
      return { t: 'arr', items, s, e: this.pos };
    }
    if (c === 0x5d || c === 0x7b || c === 0x7d || c === 0x29) {
      this.pos++;
      return { t: 'other', s, e: this.pos };
    }
    while (this.pos < b.length && !WS[b[this.pos]!] && !DELIM[b[this.pos]!]) this.pos++;
    const word = latin1(b.subarray(s, this.pos));
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { t: 'num', v: Number(word), s, e: this.pos };
    return { t: 'op', v: word, s, e: this.pos };
  }
}

function latin1(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return s;
}

function decodeName(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x23 && i + 2 < b.length && /^[0-9a-fA-F]{2}$/.test(latin1(b.subarray(i + 1, i + 3)))) {
      s += String.fromCharCode(parseInt(latin1(b.subarray(i + 1, i + 3)), 16));
      i += 2;
    } else s += String.fromCharCode(b[i]!);
  }
  return s;
}

const enc = new TextEncoder();

interface State {
  fill: ColorSpace;
  stroke: ColorSpace;
}

const INLINE_SPACES: Record<string, 'gray' | 'rgb' | 'cmyk' | 'indexed'> = {
  G: 'gray',
  DeviceGray: 'gray',
  CalGray: 'gray',
  RGB: 'rgb',
  DeviceRGB: 'rgb',
  CalRGB: 'rgb',
  CMYK: 'cmyk',
  DeviceCMYK: 'cmyk',
  I: 'indexed',
  Indexed: 'indexed',
};

const FILTER_NAMES: Record<string, string> = { Fl: 'FlateDecode', FlateDecode: 'FlateDecode' };

export function rewriteContent(src: Uint8Array, env: ContentEnv, zlib: (data: Uint8Array) => Uint8Array): Uint8Array {
  const lx = new Lexer(src);
  const out: Uint8Array[] = [];
  let copyFrom = 0;
  let state: State = { fill: { kind: 'gray' }, stroke: { kind: 'gray' } };
  const stack: State[] = [];
  let operands: Tok[] = [];

  /** Replace source bytes [from, to) with `text`, keeping what came before as is. */
  const replace = (from: number, to: number, text: string | Uint8Array) => {
    if (from > copyFrom) out.push(src.subarray(copyFrom, from));
    out.push(typeof text === 'string' ? enc.encode(text) : text);
    copyFrom = to;
  };
  const nums = (n: number): number[] | null => {
    if (operands.length !== n) return null;
    const v: number[] = [];
    for (const o of operands) {
      if (o.t !== 'num') return null;
      v.push(o.v);
    }
    return v;
  };
  const spaceFor = (n: string): ColorSpace => {
    if (n === 'DeviceGray' || n === 'G') return { kind: 'gray' };
    if (n === 'DeviceRGB') return { kind: 'rgb' };
    if (n === 'DeviceCMYK') return { kind: 'cmyk' };
    if (n === 'Pattern') return { kind: 'pattern' };
    return env.colorSpace(n);
  };
  const nameOperand = (): string | null => {
    const o = operands[operands.length - 1];
    return o && o.t === 'name' ? o.v : null;
  };

  for (let tok = lx.next(); tok; tok = lx.next()) {
    if (tok.t !== 'op') {
      operands.push(tok);
      if (operands.length > 64) operands.shift();
      continue;
    }
    const op = tok.v;
    const first = operands[0]?.s ?? tok.s;
    switch (op) {
      case 'rg':
      case 'RG': {
        const v = nums(3);
        if (!v) {
          env.unconvertible('malformed colour operands');
          break;
        }
        replace(first, tok.e, `${fmt(rgbToGray(v[0]!, v[1]!, v[2]!))} ${op === 'rg' ? 'g' : 'G'}`);
        state[op === 'rg' ? 'fill' : 'stroke'] = { kind: 'gray' };
        break;
      }
      case 'k':
      case 'K': {
        const v = nums(4);
        if (!v) {
          env.unconvertible('malformed colour operands');
          break;
        }
        replace(first, tok.e, `${fmt(cmykToGray(v[0]!, v[1]!, v[2]!, v[3]!))} ${op === 'k' ? 'g' : 'G'}`);
        state[op === 'k' ? 'fill' : 'stroke'] = { kind: 'gray' };
        break;
      }
      case 'g':
      case 'G':
        state[op === 'g' ? 'fill' : 'stroke'] = { kind: 'gray' };
        break;
      case 'cs':
      case 'CS': {
        const n = nameOperand();
        const target = op === 'cs' ? 'fill' : 'stroke';
        if (n === null) {
          env.unconvertible('malformed colour space');
          break;
        }
        const cs = spaceFor(n);
        state[target] = cs;
        if (cs.kind === 'rgb' || cs.kind === 'cmyk' || cs.kind === 'indexed') replace(first, tok.e, `/DeviceGray ${op}`);
        else if (cs.kind === 'bad') env.unconvertible('a colour space this tool can not convert');
        else if (cs.kind === 'pattern' && cs.base) env.unconvertible('an uncoloured pattern');
        break;
      }
      case 'sc':
      case 'SC':
      case 'scn':
      case 'SCN': {
        const cs = op[0] === 's' ? state.fill : state.stroke;
        if (cs.kind === 'gray' || cs.kind === 'bad') break;
        if (cs.kind === 'pattern') {
          const n = nameOperand();
          if (n !== null) env.pattern(n);
          break;
        }
        const want = cs.kind === 'rgb' ? 3 : cs.kind === 'cmyk' ? 4 : 1;
        const v = nums(want);
        if (!v) {
          env.unconvertible('malformed colour operands');
          break;
        }
        let g: number;
        if (cs.kind === 'rgb') g = rgbToGray(v[0]!, v[1]!, v[2]!);
        else if (cs.kind === 'cmyk') g = cmykToGray(v[0]!, v[1]!, v[2]!, v[3]!);
        else g = (cs.gray[Math.max(0, Math.min(cs.hival, Math.round(v[0]!)))] ?? 0) / 255;
        replace(first, tok.e, `${fmt(g)} ${op}`);
        break;
      }
      case 'q':
        stack.push({ ...state });
        break;
      case 'Q':
        if (stack.length) state = stack.pop()!;
        break;
      case 'Do': {
        const n = nameOperand();
        if (n !== null) env.xobject(n);
        break;
      }
      case 'sh': {
        const n = nameOperand();
        if (n !== null) env.shading(n);
        break;
      }
      case 'gs': {
        const n = nameOperand();
        if (n !== null) env.extGState(n);
        break;
      }
      case 'Tf': {
        const n = operands.find((o) => o.t === 'name');
        if (n && n.t === 'name') env.font(n.v);
        break;
      }
      case 'BI':
        inlineImage(tok);
        break;
      default:
        break;
    }
    operands = [];
  }
  if (copyFrom < src.length) out.push(src.subarray(copyFrom));
  return concat(out);

  function inlineImage(bi: Tok): void {
    const dict = new Map<string, Tok>();
    let key: string | null = null;
    let idEnd = -1;
    for (let t = lx.next(); t; t = lx.next()) {
      if (t.t === 'op' && t.v === 'ID') {
        idEnd = t.e;
        break;
      }
      if (key === null) {
        if (t.t === 'name') key = t.v;
      } else {
        dict.set(key, t);
        key = null;
      }
    }
    if (idEnd < 0) return;
    const get = (...names: string[]): Tok | undefined => {
      for (const n of names) {
        const v = dict.get(n);
        if (v) return v;
      }
      return undefined;
    };
    const nameOf = (t: Tok | undefined): string | undefined => (t && t.t === 'name' ? t.v : undefined);
    const numOf = (t: Tok | undefined): number | undefined => (t && t.t === 'num' ? t.v : undefined);
    const w = numOf(get('W', 'Width')) ?? 0;
    const h = numOf(get('H', 'Height')) ?? 0;
    const bpc = numOf(get('BPC', 'BitsPerComponent')) ?? 8;
    const isMask = get('IM', 'ImageMask');
    const maskOn = !!isMask && isMask.t === 'op' && isMask.v === 'true';
    const csTok = get('CS', 'ColorSpace');
    const filterTok = get('F', 'Filter');
    const filters: string[] = [];
    if (filterTok?.t === 'name') filters.push(filterTok.v);
    else if (filterTok?.t === 'arr') for (const f of filterTok.items) if (f.t === 'name') filters.push(f.v);
    // The data starts after one whitespace byte following ID.
    const dataStart = idEnd + 1;
    let space: 'gray' | 'rgb' | 'cmyk' | 'indexed' | 'unknown' = 'gray';
    if (!maskOn && csTok) {
      const n = nameOf(csTok);
      space = n !== undefined ? INLINE_SPACES[n] ?? 'unknown' : csTok.t === 'arr' ? 'indexed' : 'unknown';
      if (n !== undefined && space === 'unknown') {
        const r = env.colorSpace(n);
        space = r.kind === 'gray' ? 'gray' : 'unknown';
      }
    }
    // Find EI. Unfiltered data has a computed length; otherwise scan.
    let dataEnd = -1;
    if (filters.length === 0) {
      const comps = maskOn ? 1 : space === 'rgb' ? 3 : space === 'cmyk' ? 4 : 1;
      const len = Math.ceil((w * comps * (maskOn ? 1 : bpc)) / 8) * h;
      if (space !== 'unknown' && dataStart + len <= src.length) dataEnd = dataStart + len;
    }
    let eiAt = -1;
    const from = dataEnd >= 0 ? dataEnd : dataStart;
    for (let i = from; i + 1 < src.length; i++) {
      if (src[i] === 0x45 && src[i + 1] === 0x49 && (i === 0 || WS[src[i - 1]!]) && (i + 2 >= src.length || WS[src[i + 2]!] || DELIM[src[i + 2]!])) {
        eiAt = i;
        break;
      }
    }
    if (eiAt < 0) {
      lx.pos = src.length;
      env.unconvertible('an inline image that could not be read');
      return;
    }
    if (dataEnd < 0) dataEnd = eiAt > dataStart && WS[src[eiAt - 1]!] ? eiAt - 1 : eiAt;
    lx.pos = eiAt + 2;
    const imageStart = bi.s;
    const first = operands[0]?.s ?? imageStart;
    void first;
    if (maskOn || space === 'gray') return;
    const decodeTok = get('D', 'Decode');
    const parms = get('DP', 'DecodeParms');
    const normFilters = filters.map((f) => FILTER_NAMES[f] ?? f);
    const convertible =
      (space === 'rgb' || space === 'cmyk') && bpc === 8 && !decodeTok && !parms && w > 0 && h > 0 && normFilters.every((f) => f === 'FlateDecode') && normFilters.length <= 1;
    const gray = convertible ? env.inlineImage({ width: w, height: h, space: space as 'rgb' | 'cmyk', filters: normFilters, hasDecodeParms: !!parms, data: src.subarray(dataStart, dataEnd) }) : null;
    if (!gray) {
      env.unconvertible('an inline image in colour');
      return;
    }
    const smooth = get('I', 'Interpolate');
    const head = `BI /W ${w} /H ${h} /CS /G /BPC 8 /F /Fl${smooth && smooth.t === 'op' && smooth.v === 'true' ? ' /I true' : ''} ID `;
    const z = zlib(gray);
    const body = concat([enc.encode(head), z, enc.encode('\nEI')]);
    // Keep the bytes before BI as they were.
    replace(imageStart, lx.pos, body);
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const o = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    o.set(p, at);
    at += p.length;
  }
  return o;
}
