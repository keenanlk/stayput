/**
 * PDF page to SVG, from the pdf.js operator list.
 *
 * pdf.js (Apache-2.0) decodes the page into drawing operators; this module replays them as SVG
 * elements. Paths, fills, strokes, dashes, alpha, clipping, axial and radial gradients and
 * pictures come out as real vector or `<image>` elements. Text becomes glyph outlines (read
 * from the font pdf.js hands over, with opentype.js, MIT) plus a transparent `<text>` on top,
 * so it looks right everywhere and is still selectable and searchable.
 *
 * What SVG cannot say plainly (blend modes, soft masks, tiling patterns, mesh gradients, Type 3
 * and vertical fonts, text used as a clip) is never guessed at: the whole page is saved as a
 * picture inside the SVG, with its text still selectable, and a note says so.
 */
import type * as PdfJs from 'pdfjs-dist';
import * as opentype from 'opentype.js';
import { toCanvas } from './pdf-images';

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `a` then `b`, in PDF's row-vector convention (the same as `ctx.transform`). */
function mul(a: ArrayLike<number>, b: ArrayLike<number>): Matrix {
  return [
    a[0]! * b[0]! + a[1]! * b[2]!,
    a[0]! * b[1]! + a[1]! * b[3]!,
    a[2]! * b[0]! + a[3]! * b[2]!,
    a[2]! * b[1]! + a[3]! * b[3]!,
    a[4]! * b[0]! + a[5]! * b[2]! + b[4]!,
    a[4]! * b[1]! + a[5]! * b[3]! + b[5]!,
  ];
}

function invert(m: ArrayLike<number>): Matrix | null {
  const det = m[0]! * m[3]! - m[1]! * m[2]!;
  if (!det || !Number.isFinite(det)) return null;
  return [
    m[3]! / det,
    -m[1]! / det,
    -m[2]! / det,
    m[0]! / det,
    (m[2]! * m[5]! - m[3]! * m[4]!) / det,
    (m[1]! * m[4]! - m[0]! * m[5]!) / det,
  ];
}

const isIdentity = (m: ArrayLike<number>) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

/** A number for an attribute: at most 3 decimals, no "-0", no exponent. */
function n(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const s = (Math.round(v * 1000) / 1000).toString();
  if (s.includes('e')) return '0';
  return s === '-0' ? '0' : s;
}

const matrixAttr = (m: ArrayLike<number>) => `matrix(${Array.from(m, n).join(' ')})`;
const transformAttr = (m: ArrayLike<number>) => (isIdentity(m) ? '' : ` transform="${matrixAttr(m)}"`);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** XML 1.0 has no room for most control characters; a stray one would make the whole file unreadable. */
// eslint-disable-next-line no-control-regex
const XML_BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿\ud800-\udfff]/g;
const xmlText = (s: string) => esc(s.replace(XML_BAD, ''));

export interface PageSvg {
  svg: string;
  /** One plain-language line per thing worth knowing about this page; empty when the conversion was exact. */
  notes: string[];
  /** The page was saved as a picture inside the SVG because it uses something SVG cannot reproduce exactly. */
  rasterised: boolean;
  /** The page is a scan: a picture and nothing else. */
  imageOnly: boolean;
  width: number;
  height: number;
}

export interface ConvertOptions {
  /** Paint a white page behind everything. */
  background: boolean;
  /** Longest side, in pixels, a picture may keep; larger ones are scaled down (phones). */
  maxImageSide: number;
  /** Most pixels in a page that is saved as a picture. */
  maxRasterPixels: number;
}

export const DESKTOP_OPTIONS: ConvertOptions = { background: true, maxImageSide: 6000, maxRasterPixels: 16_000_000 };
export const PHONE_OPTIONS: ConvertOptions = { background: true, maxImageSide: 2500, maxRasterPixels: 6_000_000 };

type Op = { fn: number; args: unknown[] };

interface FontInfo {
  ot: opentype.Font | null;
  /** Multiplier from the font's own units to 1000 per em. */
  unit: number;
  /** The font matrix's x scale: glyph widths from pdf.js are in glyph units, this makes them ems. */
  em: number;
  toFontChar: ArrayLike<number> | null;
  /** The name the PDF gives the font, for notes. */
  name: string;
  family: string;
  weight: string;
  style: string;
  type3: boolean;
  vertical: boolean;
  /** Glyph outlines already defined on this page: char code to def id, or '' when there is no outline. */
  defs: Map<number, string>;
}

/** A gradient paint keeps the matrix of the space its pattern was set in (the page, or the form drawing it). */
type Paint = { kind: 'color'; value: string } | { kind: 'gradient'; ir: unknown[]; to: Matrix };

interface State {
  ctm: Matrix;
  fill: Paint;
  stroke: Paint;
  fillAlpha: number;
  strokeAlpha: number;
  lineWidth: number;
  cap: number;
  join: number;
  miter: number;
  dash: number[];
  dashPhase: number;
  font: FontInfo | null;
  fontSize: number;
  fontDirection: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
  renderMode: number;
  /** `<g>` elements this state level has opened (clips, groups) and must close when it ends. */
  open: number;
}

const BLACK: Paint = { kind: 'color', value: '#000000' };

const CAPS = ['butt', 'round', 'square'];
const JOINS = ['miter', 'round', 'bevel'];

function fresh(ctm: Matrix): State {
  return {
    ctm,
    fill: BLACK,
    stroke: BLACK,
    fillAlpha: 1,
    strokeAlpha: 1,
    lineWidth: 1,
    cap: 0,
    join: 0,
    miter: 10,
    dash: [],
    dashPhase: 0,
    font: null,
    fontSize: 0,
    fontDirection: 1,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
    renderMode: 0,
    open: 0,
  };
}

/** One path from pdf.js's draw-op array (moveTo 0, lineTo 1, curveTo 2, quadraticCurveTo 3, closePath 4). */
function pathData(a: ArrayLike<number>): string {
  const parts: string[] = [];
  for (let i = 0; i < a.length; ) {
    switch (a[i]) {
      case 0:
        parts.push(`M${n(a[i + 1]!)} ${n(a[i + 2]!)}`);
        i += 3;
        break;
      case 1:
        parts.push(`L${n(a[i + 1]!)} ${n(a[i + 2]!)}`);
        i += 3;
        break;
      case 2:
        parts.push(`C${n(a[i + 1]!)} ${n(a[i + 2]!)} ${n(a[i + 3]!)} ${n(a[i + 4]!)} ${n(a[i + 5]!)} ${n(a[i + 6]!)}`);
        i += 7;
        break;
      case 3:
        parts.push(`Q${n(a[i + 1]!)} ${n(a[i + 2]!)} ${n(a[i + 3]!)} ${n(a[i + 4]!)}`);
        i += 5;
        break;
      case 4:
        parts.push('Z');
        i += 1;
        break;
      default:
        return parts.join('');
    }
  }
  return parts.join('');
}

function waitFor<T>(get: (cb: (v: T) => void) => void, ms = 15_000): Promise<T | null> {
  return new Promise((ok) => {
    const timer = setTimeout(() => ok(null), ms);
    try {
      get((v) => {
        clearTimeout(timer);
        ok(v ?? null);
      });
    } catch {
      clearTimeout(timer);
      ok(null);
    }
  });
}

async function canvasDataUri(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg'): Promise<string> {
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, 0.92));
  if (!blob) return canvas.toDataURL(type, 0.92);
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(blob);
  });
}

/** True when every pixel of the canvas is opaque. */
function isOpaque(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const step = 256;
  for (let y = 0; y < canvas.height; y += step) {
    const h = Math.min(step, canvas.height - y);
    const d = ctx.getImageData(0, y, canvas.width, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return false;
  }
  return true;
}

function shrink(canvas: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const big = Math.max(canvas.width, canvas.height);
  if (big <= maxSide) return canvas;
  const s = maxSide / big;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * s));
  out.height = Math.max(1, Math.round(canvas.height * s));
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  canvas.width = canvas.height = 0;
  return out;
}

/** A picture to a data URI: PNG, or JPEG for big opaque pictures (a scanned page) so the file stays a sensible size. */
async function imageUri(canvas: HTMLCanvasElement, maxSide: number): Promise<string> {
  const c = shrink(canvas, maxSide);
  const type = c.width * c.height > 400_000 && isOpaque(c) ? 'image/jpeg' : 'image/png';
  const uri = await canvasDataUri(c, type);
  c.width = c.height = 0;
  return uri;
}

const FILL_OPS = new Set([22, 23, 24, 25, 26, 27]);
const STROKE_OPS = new Set([20, 21, 24, 25, 26, 27]);
const CLOSE_OPS = new Set([21, 26, 27]);
const EVEN_ODD_OPS = new Set([23, 25, 27]);

class PageConverter {
  private out: string[] = [];
  /** Invisible text for every run, in page order (also what a picture-fallback page keeps). */
  private selectable: string[] = [];
  private defs: string[] = [];
  private ids = 0;
  private stack: State[] = [];
  private base: Matrix = IDENTITY;
  private baseStack: Matrix[] = [];
  private s: State;
  private pendingClip: '' | 'nonzero' | 'evenodd' = '';
  private legacy = '';
  private cur: [number, number] = [0, 0];
  private tm: Matrix = IDENTITY;
  private tx = 0;
  private ty = 0;
  private lineX = 0;
  private lineY = 0;
  private visible: boolean[] = [];
  private fonts = new Map<string, FontInfo | null>();
  private images = new Map<string, string>();
  private gradients = new Map<string, string>();
  readonly unsupported = new Set<string>();
  readonly notes = new Set<string>();
  paintedImages = 0;
  paintedOther = 0;
  visibleText = 0;
  private fontFallbacks = new Set<string>();

  constructor(
    private readonly lib: typeof PdfJs,
    private readonly page: PdfJs.PDFPageProxy,
    private readonly optionalContent: { isVisible(group: unknown): boolean } | null,
    private readonly opts: ConvertOptions,
  ) {
    this.s = fresh(IDENTITY);
  }

  private id(prefix: string): string {
    return `${prefix}${++this.ids}`;
  }

  private get shown(): boolean {
    return this.visible.length === 0 || this.visible[this.visible.length - 1]!;
  }

  private mark(reason: string) {
    this.unsupported.add(reason);
  }

  /* ---------- state ---------- */

  private save() {
    this.stack.push(this.s);
    this.s = { ...this.s, open: 0 };
  }

  private restore() {
    // The state this level opened groups for ends here; an unmatched restore is ignored.
    const prev = this.stack.pop();
    if (!prev) return;
    for (let i = 0; i < this.s.open; i++) this.out.push('</g>');
    this.s = prev;
  }

  private openClip(def: string) {
    const id = this.id('c');
    this.defs.push(`<clipPath id="${id}">${def}</clipPath>`);
    this.out.push(`<g clip-path="url(#${id})">`);
    this.s.open++;
  }

  private clipRect(b: ArrayLike<number>, m: ArrayLike<number> | null) {
    const x = Math.min(b[0]!, b[2]!);
    const y = Math.min(b[1]!, b[3]!);
    const w = Math.abs(b[2]! - b[0]!);
    const h = Math.abs(b[3]! - b[1]!);
    const ctm = m ? mul(m, this.s.ctm) : this.s.ctm;
    this.openClip(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${transformAttr(ctm)}/>`);
  }

  /* ---------- paint ---------- */

  private colorOf(p: Paint, el: Matrix): string {
    if (p.kind === 'color') return p.value === 'transparent' ? 'none' : p.value;
    const inv = invert(el);
    if (!inv) {
      this.mark('a gradient placed with a flat transform');
      return 'none';
    }
    return this.gradient(p.ir, mul(p.to, inv));
  }

  /** A gradient def for a shading IR; `gt` carries its coordinates into the space of the element that uses it. */
  private gradient(ir: unknown[], gt: Matrix): string {
    const [, type, , stops, p0, p1, r0, r1] = ir as [string, string, unknown, [number, string][], number[], number[], number | null, number | null];
    const key = JSON.stringify([ir, gt]);
    const known = this.gradients.get(key);
    if (known) return `url(#${known})`;
    const id = this.id('g');
    // A "transparent" stop keeps the colour next to it, so the edge fades out without going grey.
    const solid = (i: number): string => {
      for (let k = i; k < stops.length; k++) if (stops[k]![1] !== 'transparent') return stops[k]![1];
      for (let k = i; k >= 0; k--) if (stops[k]![1] !== 'transparent') return stops[k]![1];
      return '#000000';
    };
    const stopXml = stops
      .map(([o, c], i) => `<stop offset="${n(Math.min(1, Math.max(0, o)))}" stop-color="${c === 'transparent' ? solid(i) : c}"${c === 'transparent' ? ' stop-opacity="0"' : ''}/>`)
      .join('');
    const gtAttr = isIdentity(gt) ? '' : ` gradientTransform="${matrixAttr(gt)}"`;
    if (type === 'axial') {
      this.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(p0![0]!)}" y1="${n(p0![1]!)}" x2="${n(p1![0]!)}" y2="${n(p1![1]!)}"${gtAttr}>${stopXml}</linearGradient>`);
    } else {
      this.defs.push(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(p1![0]!)}" cy="${n(p1![1]!)}" r="${n(r1 ?? 0)}" fx="${n(p0![0]!)}" fy="${n(p0![1]!)}" fr="${n(r0 ?? 0)}"${gtAttr}>${stopXml}</radialGradient>`,
      );
    }
    this.gradients.set(key, id);
    return `url(#${id})`;
  }

  private strokeAttrs(el: Matrix, scale = 1): string {
    const s = this.s;
    const c = this.colorOf(s.stroke, el);
    if (c === 'none') return ' stroke="none"';
    // A zero width means "the thinnest line the device can draw": one device pixel.
    const unit = Math.sqrt(Math.abs(el[0] * el[3] - el[1] * el[2])) || 1;
    const lw = s.lineWidth === 0 ? 1 / unit : s.lineWidth * scale;
    let a = ` stroke="${c}" stroke-width="${n(lw)}"`;
    if (s.cap) a += ` stroke-linecap="${CAPS[s.cap] ?? 'butt'}"`;
    if (s.join) a += ` stroke-linejoin="${JOINS[s.join] ?? 'miter'}"`;
    if (s.join === 0 && s.miter !== 10) a += ` stroke-miterlimit="${n(s.miter)}"`;
    const dash = s.dash.filter((d) => d >= 0);
    if (dash.length && dash.some((d) => d > 0)) {
      a += ` stroke-dasharray="${dash.map((d) => n(d * scale)).join(' ')}"`;
      if (s.dashPhase) a += ` stroke-dashoffset="${n(s.dashPhase * scale)}"`;
    }
    if (s.strokeAlpha !== 1) a += ` stroke-opacity="${n(s.strokeAlpha)}"`;
    return a;
  }

  private fillAttrs(el: Matrix, evenOdd: boolean): string {
    const c = this.colorOf(this.s.fill, el);
    let a = ` fill="${c}"`;
    if (evenOdd) a += ' fill-rule="evenodd"';
    if (this.s.fillAlpha !== 1) a += ` fill-opacity="${n(this.s.fillAlpha)}"`;
    return a;
  }

  private paintPath(op: number, d: string) {
    const fill = FILL_OPS.has(op);
    const stroke = STROKE_OPS.has(op);
    const clip = this.pendingClip;
    if (this.shown && d && (fill || stroke)) {
      if (CLOSE_OPS.has(op) && !d.endsWith('Z')) d += 'Z';
      const el = this.s.ctm;
      let attrs = fill ? this.fillAttrs(el, EVEN_ODD_OPS.has(op)) : ' fill="none"';
      if (stroke) attrs += this.strokeAttrs(el);
      this.out.push(`<path d="${d}"${attrs}${transformAttr(el)}/>`);
      this.paintedOther++;
    }
    if (clip) {
      this.pendingClip = '';
      if (d) this.openClip(`<path d="${d}" clip-rule="${clip}"${transformAttr(this.s.ctm)}/>`);
      else this.openClip('<rect width="0" height="0"/>');
    }
    this.legacy = '';
  }

  /* ---------- fonts ---------- */

  private async font(id: string): Promise<FontInfo | null> {
    if (this.fonts.has(id)) return this.fonts.get(id)!;
    const store = id.startsWith('g_') ? this.page.commonObjs : this.page.objs;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = await waitFor((cb) => store.get(id, cb));
    let info: FontInfo | null = null;
    if (f) {
      const unit = 1000;
      info = {
        ot: null,
        unit,
        em: f.fontMatrix?.[0] || 0.001,
        toFontChar: f.toFontChar ?? null,
        name: String(f.name || 'unnamed').replace(/^[A-Z]{6}\+/, ''),
        family: String(f.systemFontInfo?.css || f.fallbackName || 'sans-serif').replace(/[<>&"]/g, ''),
        weight: f.black ? '900' : f.bold ? 'bold' : 'normal',
        style: f.italic ? 'italic' : 'normal',
        type3: !!f.isType3Font,
        vertical: !!f.vertical,
        defs: new Map(),
      };
      if (!info.type3 && f.data && f.data.length && !f.isInvalidPDFjsFont) {
        try {
          const bytes: Uint8Array = f.data;
          const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
          const ot = opentype.parse(buf);
          info.ot = ot;
          // Outlines are written as 1000 units to the em, whatever the font uses.
          const fm0 = f.fontMatrix?.[0] ?? 0.001;
          info.unit = ot.outlinesFormat === 'cff' ? ot.unitsPerEm * fm0 * 1000 : 1000;
        } catch {
          info.ot = null;
        }
      }
    }
    this.fonts.set(id, info);
    return info;
  }

  /** The id of a `<path>` def holding one glyph's outline, or '' when it has none (a space). */
  private glyphDef(font: FontInfo, glyph: { originalCharCode: number; fontChar?: string }): string {
    const code = glyph.originalCharCode;
    const known = font.defs.get(code);
    if (known !== undefined) return known;
    let def = '';
    const ot = font.ot;
    if (ot) {
      let ch = glyph.fontChar || '';
      if (!ch && font.toFontChar && font.toFontChar[code] !== undefined) ch = String.fromCodePoint(font.toFontChar[code]!);
      if (ch) {
        const gi = ot.charToGlyphIndex(ch);
        if (gi > 0) {
          const p = ot.glyphs.get(gi).getPath(0, 0, font.unit);
          let d = '';
          for (const c of p.commands) {
            // opentype.js paths are y-down; PDF space is y-up.
            if (c.type === 'M') d += `M${n(c.x!)} ${n(-c.y!)}`;
            else if (c.type === 'L') d += `L${n(c.x!)} ${n(-c.y!)}`;
            else if (c.type === 'C') d += `C${n(c.x1!)} ${n(-c.y1!)} ${n(c.x2!)} ${n(-c.y2!)} ${n(c.x!)} ${n(-c.y!)}`;
            else if (c.type === 'Q') d += `Q${n(c.x1!)} ${n(-c.y1!)} ${n(c.x!)} ${n(-c.y!)}`;
            else d += 'Z';
          }
          if (d) {
            def = this.id('h');
            this.defs.push(`<path id="${def}" d="${d}"/>`);
          }
        }
      }
    }
    font.defs.set(code, def);
    return def;
  }

  private showText(items: unknown[]) {
    const s = this.s;
    const font = s.font;
    if (!font) return;
    if (font.type3) {
      this.mark('Type 3 fonts');
      return;
    }
    if (font.vertical) {
      this.mark('vertical text');
      return;
    }
    if (s.renderMode >= 4 && s.renderMode <= 7) this.mark('text used as a clipping shape');
    const size = s.fontSize;
    const dir = s.fontDirection;
    const th = s.hScale * dir;
    const mode = s.renderMode & 3;
    const visibleMode = mode !== 3 && this.shown;
    const run: Matrix = mul([size * th / 1000, 0, 0, size * dir / 1000, 0, 0], mul([1, 0, 0, 1, this.tx, this.ty + s.rise], mul(this.tm, s.ctm)));
    // Advances are in text units before the horizontal scale and size direction.
    let x = 0;
    const uses: string[] = [];
    const chars: string[] = [];
    const xs: number[] = [];
    const missing = !font.ot;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of items as any[]) {
      if (typeof g === 'number') {
        x += (-g * size) / 1000;
        continue;
      }
      const spacing = (g.isSpace ? s.wordSpacing : 0) + s.charSpacing;
      const advance = g.width * size * font.em;
      const u: string = typeof g.unicode === 'string' ? g.unicode : '';
      if (u && u !== '\u0000') {
        const px = x;
        for (let k = 0; k < u.length; k++) {
          chars.push(u[k]!);
          xs.push(px + (advance * k) / u.length);
        }
      }
      if (visibleMode && !missing && (g.isInFont || g.fontChar)) {
        const def = this.glyphDef(font, g);
        if (def) uses.push(`<use xlink:href="#${def}" x="${n((x * 1000) / (size || 1))}"/>`);
      }
      x += advance + spacing * dir;
    }
    const advanceTotal = x;
    if (visibleMode && uses.length) {
      const el = run;
      const fillOn = mode === 0 || mode === 2;
      const strokeOn = mode === 1 || mode === 2;
      let attrs = fillOn ? this.fillAttrs(el, false) : ' fill="none"';
      if (strokeOn) attrs += this.strokeAttrs(el, 1000 / (Math.abs(size) || 1));
      this.out.push(`<g${attrs}${transformAttr(el)}>${uses.join('')}</g>`);
      this.visibleText += uses.length;
    }
    // The selectable layer: invisible over outlines, or the visible text itself when the font is not embedded.
    if (chars.length && this.shown) {
      const L: Matrix = mul([th, 0, 0, -dir, 0, 0], mul([1, 0, 0, 1, this.tx, this.ty + s.rise], mul(this.tm, s.ctm)));
      const family = font.family.includes(',') || font.family.includes('"') ? font.family : `${font.family}, sans-serif`;
      const element = (attrs: string) =>
        `<text xml:space="preserve" font-family="${esc(family)}" font-size="${n(Math.abs(size))}"` +
        `${font.weight !== 'normal' ? ` font-weight="${font.weight}"` : ''}${font.style !== 'normal' ? ` font-style="${font.style}"` : ''}` +
        `${attrs} x="${xs.map(n).join(' ')}" y="0"${transformAttr(L)}>${xmlText(chars.join(''))}</text>`;
      const invisible = element(' fill="#000" fill-opacity="0"');
      this.selectable.push(invisible);
      if (missing && mode !== 3) {
        this.out.push(element(mode === 1 ? ' fill="none"' + this.strokeAttrs(L) : this.fillAttrs(L, false)));
        this.fontFallbacks.add(font.name);
        this.visibleText += chars.length;
        this.paintedOther++;
      } else {
        this.out.push(invisible);
      }
    }
    this.tx += advanceTotal * th;
  }

  /* ---------- pictures ---------- */

  private async pictureObject(id: string) {
    const store = id.startsWith('g_') ? this.page.commonObjs : this.page.objs;
    return waitFor<unknown>((cb) => store.get(id, cb));
  }

  private async placeImage(img: { width: number; height: number } | null) {
    if (!img || !this.shown) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canvas = toCanvas(img as any);
    if (!canvas) return;
    const uri = await imageUri(canvas, this.opts.maxImageSide);
    this.emitImage(uri);
  }

  private emitImage(uri: string) {
    const m = mul([1, 0, 0, -1, 0, 1], this.s.ctm);
    const opacity = this.s.fillAlpha !== 1 ? ` opacity="${n(this.s.fillAlpha)}"` : '';
    this.out.push(`<image xlink:href="${uri}" width="1" height="1" preserveAspectRatio="none"${opacity}${transformAttr(m)}/>`);
    this.paintedImages++;
  }

  /** A 1-bit stencil mask painted in the current fill colour. */
  private async placeMask(src: Record<string, unknown> | null) {
    if (!src || !this.shown) return;
    if (this.s.fill.kind !== 'color') {
      this.mark('a stencil mask filled with a gradient');
      return;
    }
    let img = src as { width: number; height: number; data?: Uint8Array | string; bitmap?: ImageBitmap };
    if (typeof img.data === 'string') {
      const o = (await this.pictureObject(img.data)) as typeof img | null;
      if (!o) return;
      img = o;
    }
    const { width, height } = img;
    if (!width || !height) return;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0);
    else if (img.data instanceof Uint8Array) {
      const out = ctx.createImageData(width, height);
      const row = (width + 7) >> 3;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          // A clear bit paints; a set bit leaves the page alone.
          const bit = (img.data[y * row + (x >> 3)] ?? 255) >> (7 - (x & 7)) & 1;
          out.data[(y * width + x) * 4 + 3] = bit ? 0 : 255;
        }
      ctx.putImageData(out, 0, 0);
    } else return;
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = (this.s.fill as { value: string }).value;
    ctx.fillRect(0, 0, width, height);
    this.emitImage(await canvasDataUri(shrink(canvas, this.opts.maxImageSide), 'image/png'));
  }

  /* ---------- the walk ---------- */

  async run(ops: Op[]) {
    this.s = fresh(IDENTITY);
    const { OPS } = this.lib;
    // Fonts first, so the walk below never waits on one.
    const wanted = new Set<string>();
    for (const o of ops) if (o.fn === OPS.setFont && typeof o.args[0] === 'string') wanted.add(o.args[0]);
    for (const id of wanted) await this.font(id);

    for (const { fn, args } of ops) {
      switch (fn) {
        case OPS.save:
          this.save();
          break;
        case OPS.restore:
          this.restore();
          break;
        case OPS.transform:
          this.s.ctm = mul(args as number[], this.s.ctm);
          break;
        case OPS.setLineWidth:
          this.s.lineWidth = args[0] as number;
          break;
        case OPS.setLineCap:
          this.s.cap = args[0] as number;
          break;
        case OPS.setLineJoin:
          this.s.join = args[0] as number;
          break;
        case OPS.setMiterLimit:
          this.s.miter = args[0] as number;
          break;
        case OPS.setDash:
          this.s.dash = Array.from((args[0] as number[]) ?? []);
          this.s.dashPhase = (args[1] as number) ?? 0;
          break;
        case OPS.setGState:
          await this.gstate(args[0] as [string, unknown][]);
          break;
        case OPS.setFillRGBColor:
          this.s.fill = { kind: 'color', value: args[0] as string };
          break;
        case OPS.setStrokeRGBColor:
          this.s.stroke = { kind: 'color', value: args[0] as string };
          break;
        case OPS.setFillTransparent:
          this.s.fill = { kind: 'color', value: 'transparent' };
          break;
        case OPS.setStrokeTransparent:
          this.s.stroke = { kind: 'color', value: 'transparent' };
          break;
        case OPS.setFillColorN:
        case OPS.setStrokeColorN: {
          const p = await this.patternPaint(args);
          if (p) {
            if (fn === OPS.setFillColorN) this.s.fill = p;
            else this.s.stroke = p;
          }
          break;
        }
        case OPS.constructPath: {
          const [op, data] = args as [number, ArrayLike<number>[]];
          this.paintPath(op, data?.[0] ? pathData(data[0]) : this.legacy);
          break;
        }
        case OPS.rawFillPath: {
          const data = args[0] as ArrayLike<number>[];
          if (data?.[0]) this.paintPath(OPS.fill, pathData(data[0]));
          break;
        }
        case OPS.moveTo:
          this.legacy += `M${n(args[0] as number)} ${n(args[1] as number)}`;
          this.cur = [args[0] as number, args[1] as number];
          break;
        case OPS.lineTo:
          this.legacy += `L${n(args[0] as number)} ${n(args[1] as number)}`;
          this.cur = [args[0] as number, args[1] as number];
          break;
        case OPS.curveTo:
          this.legacy += `C${(args as number[]).map(n).join(' ')}`;
          this.cur = [args[4] as number, args[5] as number];
          break;
        case OPS.curveTo2:
          this.legacy += `C${n(this.cur[0])} ${n(this.cur[1])} ${(args as number[]).map(n).join(' ')}`;
          this.cur = [args[2] as number, args[3] as number];
          break;
        case OPS.curveTo3:
          this.legacy += `C${n(args[0] as number)} ${n(args[1] as number)} ${n(args[2] as number)} ${n(args[3] as number)} ${n(args[2] as number)} ${n(args[3] as number)}`;
          this.cur = [args[2] as number, args[3] as number];
          break;
        case OPS.closePath:
          this.legacy += 'Z';
          break;
        case OPS.rectangle: {
          const [x, y, w, h] = args as number[];
          this.legacy += `M${n(x!)} ${n(y!)}L${n(x! + w!)} ${n(y!)}L${n(x! + w!)} ${n(y! + h!)}L${n(x!)} ${n(y! + h!)}Z`;
          this.cur = [x!, y!];
          break;
        }
        case OPS.stroke:
        case OPS.closeStroke:
        case OPS.fill:
        case OPS.eoFill:
        case OPS.fillStroke:
        case OPS.eoFillStroke:
        case OPS.closeFillStroke:
        case OPS.closeEOFillStroke:
        case OPS.endPath:
          this.paintPath(fn, this.legacy);
          break;
        case OPS.clip:
          this.pendingClip = 'nonzero';
          break;
        case OPS.eoClip:
          this.pendingClip = 'evenodd';
          break;
        case OPS.shadingFill:
          await this.shading(args[0] as string);
          break;
        /* text */
        case OPS.beginText:
          this.tm = IDENTITY;
          this.tx = this.ty = this.lineX = this.lineY = 0;
          break;
        case OPS.setCharSpacing:
          this.s.charSpacing = args[0] as number;
          break;
        case OPS.setWordSpacing:
          this.s.wordSpacing = args[0] as number;
          break;
        case OPS.setHScale:
          this.s.hScale = (args[0] as number) / 100;
          break;
        case OPS.setLeading:
          this.s.leading = -(args[0] as number);
          break;
        case OPS.setFont:
          this.setFont(args[0] as string, args[1] as number);
          break;
        case OPS.setTextRenderingMode:
          this.s.renderMode = args[0] as number;
          break;
        case OPS.setTextRise:
          this.s.rise = args[0] as number;
          break;
        case OPS.moveText:
          this.tx = this.lineX += args[0] as number;
          this.ty = this.lineY += args[1] as number;
          break;
        case OPS.setLeadingMoveText:
          this.s.leading = -(args[1] as number);
          this.tx = this.lineX += args[0] as number;
          this.ty = this.lineY += args[1] as number;
          break;
        case OPS.setTextMatrix:
          // pdf.js sends the six numbers as one array.
          this.tm = Array.from((Array.isArray(args[0]) || ArrayBuffer.isView(args[0]) ? args[0] : args) as ArrayLike<number>) as Matrix;
          this.tx = this.ty = this.lineX = this.lineY = 0;
          break;
        case OPS.nextLine:
          this.tx = this.lineX += 0;
          this.ty = this.lineY += this.s.leading;
          break;
        case OPS.showText:
        case OPS.showSpacedText:
          this.showText(args[0] as unknown[]);
          break;
        case OPS.nextLineShowText:
          this.tx = this.lineX += 0;
          this.ty = this.lineY += this.s.leading;
          this.showText(args[0] as unknown[]);
          break;
        case OPS.nextLineSetSpacingShowText:
          this.s.wordSpacing = args[0] as number;
          this.s.charSpacing = args[1] as number;
          this.tx = this.lineX += 0;
          this.ty = this.lineY += this.s.leading;
          this.showText(args[2] as unknown[]);
          break;
        /* pictures */
        case OPS.paintImageXObject: {
          const obj = await this.pictureObject(args[0] as string);
          const key = args[0] as string;
          if (this.shown) {
            let uri = this.images.get(key);
            if (!uri && obj) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const canvas = toCanvas(obj as any);
              if (canvas) {
                uri = await imageUri(canvas, this.opts.maxImageSide);
                this.images.set(key, uri);
              }
            }
            if (uri) this.emitImage(uri);
          }
          break;
        }
        case OPS.paintInlineImageXObject:
          await this.placeImage(args[0] as { width: number; height: number });
          break;
        case OPS.paintImageMaskXObject:
          await this.placeMask(args[0] as Record<string, unknown>);
          break;
        case OPS.paintSolidColorImageMask:
          if (this.shown) {
            this.out.push(`<rect width="1" height="1"${this.fillAttrs(this.s.ctm, false)}${transformAttr(this.s.ctm)}/>`);
            this.paintedOther++;
          }
          break;
        case OPS.paintImageXObjectRepeat:
        case OPS.paintImageMaskXObjectGroup:
        case OPS.paintImageMaskXObjectRepeat:
        case OPS.paintInlineImageXObjectGroup:
          this.mark('repeated pictures');
          break;
        /* forms, groups, layers */
        case OPS.paintFormXObjectBegin:
          this.save();
          this.baseStack.push(this.base);
          if (args[0]) this.s.ctm = mul(args[0] as number[], this.s.ctm);
          this.base = this.s.ctm;
          if (args[1]) this.clipRect(args[1] as number[], null);
          break;
        case OPS.paintFormXObjectEnd:
          this.restore();
          this.base = this.baseStack.pop() ?? IDENTITY;
          break;
        case OPS.beginGroup: {
          const g = (args[0] ?? {}) as { bbox?: number[]; matrix?: number[]; smask?: unknown; knockout?: boolean; isGray?: boolean };
          this.save();
          if (g.smask) this.mark('soft masks');
          if (g.knockout) this.mark('knockout groups');
          if (g.bbox) this.clipRect(g.bbox, g.matrix ?? null);
          if (this.s.fillAlpha !== 1) {
            this.out.push(`<g opacity="${n(this.s.fillAlpha)}">`);
            this.s.open++;
            this.s.fillAlpha = 1;
            this.s.strokeAlpha = 1;
          }
          break;
        }
        case OPS.endGroup:
          this.restore();
          break;
        case OPS.beginMarkedContent:
          this.visible.push(this.shown);
          break;
        case OPS.beginMarkedContentProps: {
          const visible = args[0] === 'OC' && this.optionalContent ? this.optionalContent.isVisible(args[1]) : true;
          this.visible.push(this.shown && visible);
          break;
        }
        case OPS.endMarkedContent:
          this.visible.pop();
          break;
        case OPS.beginAnnotation: {
          // Annotations are drawn from the page's own space again, whatever was open.
          while (this.stack.length) this.restore();
          for (let i = 0; i < this.s.open; i++) this.out.push('</g>');
          this.s = fresh(IDENTITY);
          this.visible = [];
          this.baseStack = [];
          const rect = args[1] as number[] | null;
          if (rect) this.clipRect(rect, null);
          this.s.ctm = mul(args[3] as number[], mul(args[2] as number[], IDENTITY));
          this.base = this.s.ctm;
          break;
        }
        case OPS.endAnnotation:
          while (this.stack.length) this.restore();
          for (let i = 0; i < this.s.open; i++) this.out.push('</g>');
          this.s = fresh(IDENTITY);
          break;
        default:
          break;
      }
    }
    while (this.stack.length) this.restore();
    for (let i = 0; i < this.s.open; i++) this.out.push('</g>');
  }

  private setFont(id: string, size: number) {
    const f = this.fonts.get(id) ?? null;
    this.s.font = f;
    this.s.fontDirection = size < 0 ? -1 : 1;
    this.s.fontSize = Math.abs(size);
  }

  private async gstate(states: [string, unknown][]) {
    for (const [key, value] of states) {
      switch (key) {
        case 'LW':
          this.s.lineWidth = value as number;
          break;
        case 'LC':
          this.s.cap = value as number;
          break;
        case 'LJ':
          this.s.join = value as number;
          break;
        case 'ML':
          this.s.miter = value as number;
          break;
        case 'D':
          this.s.dash = Array.from((value as [number[], number])[0] ?? []);
          this.s.dashPhase = (value as [number[], number])[1] ?? 0;
          break;
        case 'CA':
          this.s.strokeAlpha = value as number;
          break;
        case 'ca':
          this.s.fillAlpha = value as number;
          break;
        case 'Font': {
          const [id, size] = value as [string, number];
          await this.font(id);
          this.setFont(id, size);
          break;
        }
        case 'BM':
          if (value && value !== 'source-over' && value !== 'normal') this.mark('blend modes');
          break;
        case 'SMask':
          if (value) this.mark('soft masks');
          break;
        default:
          break;
      }
    }
  }

  private async patternPaint(args: unknown[]): Promise<Paint | null> {
    if (args[0] === 'TilingPattern') {
      this.mark('tiling patterns');
      return null;
    }
    const id = args[1] as string;
    const ir = (await this.pictureObject(id)) as unknown[] | null;
    if (!ir) return null;
    if (ir[0] === 'RadialAxial') return { kind: 'gradient', ir, to: mul((args[2] as Matrix | null) ?? IDENTITY, this.base) };
    if (ir[0] === 'Mesh') {
      this.mark('mesh gradients');
      return null;
    }
    this.mark('a pattern type SVG has no equivalent for');
    return null;
  }

  private async shading(id: string) {
    const ir = (await this.pictureObject(id)) as unknown[] | null;
    if (!ir || !this.shown) return;
    if (ir[0] === 'Mesh') {
      this.mark('mesh gradients');
      return;
    }
    if (ir[0] !== 'RadialAxial') return;
    const bbox = ir[2] as number[] | null;
    // The shading fills the whole clip; cover the page, seen from the current space.
    const view = this.page.view;
    const inv = invert(this.s.ctm);
    if (!inv) return;
    const corners = [
      [view[0]!, view[1]!],
      [view[2]!, view[1]!],
      [view[2]!, view[3]!],
      [view[0]!, view[3]!],
    ].map(([x, y]) => [x! * inv[0] + y! * inv[2] + inv[4], x! * inv[1] + y! * inv[3] + inv[5]] as const);
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const x0 = Math.min(...xs) - 1;
    const y0 = Math.min(...ys) - 1;
    const x1 = Math.max(...xs) + 1;
    const y1 = Math.max(...ys) + 1;
    // The rect is drawn with the current matrix, so the gradient's own coordinates are already in its space.
    const g = this.gradient(ir, IDENTITY);
    const clip = bbox ? `<g clip-path="url(#${this.addBBoxClip(bbox)})">` : '';
    const alpha = this.s.fillAlpha !== 1 ? ` fill-opacity="${n(this.s.fillAlpha)}"` : '';
    this.out.push(`${clip}<rect x="${n(x0)}" y="${n(y0)}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" fill="${g}"${alpha}${transformAttr(this.s.ctm)}/>${clip ? '</g>' : ''}`);
    this.paintedOther++;
  }

  private addBBoxClip(b: number[]): string {
    const id = this.id('c');
    this.defs.push(`<clipPath id="${id}"><rect x="${n(b[0]!)}" y="${n(b[1]!)}" width="${n(b[2]! - b[0]!)}" height="${n(b[3]! - b[1]!)}"${transformAttr(this.s.ctm)}/></clipPath>`);
    return id;
  }

  body(): { defs: string; content: string } {
    return { defs: this.defs.join(''), content: this.out.join('') };
  }

  /** The invisible text of the page, for the picture fallback (written without outlines). */
  selectableOnly(): string {
    return this.selectable.join('');
  }

  get fontFallbackNames(): string[] {
    return [...this.fontFallbacks];
  }
}

/** How big, relative to 1 CSS pixel per point, a page that has to be a picture is drawn. */
function renderScale(w: number, h: number, maxPixels: number): number {
  const wanted = 2;
  const cap = Math.sqrt(maxPixels / Math.max(1, w * h));
  return Math.max(0.25, Math.min(wanted, cap));
}

/**
 * Convert one page. `doc` is a pdf.js document opened with `fontExtraProperties: true` (see
 * openForSvg), which keeps each embedded font's bytes so glyph outlines can be read from them.
 */
export async function pageToSvg(
  lib: typeof PdfJs,
  doc: PdfJs.PDFDocumentProxy,
  pageNumber: number,
  opts: ConvertOptions,
  optionalContent: { isVisible(group: unknown): boolean } | null,
): Promise<PageSvg> {
  const page = await doc.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale: 1 });
    const width = viewport.width;
    const height = viewport.height;
    const list = await page.getOperatorList();
    const ops: Op[] = [];
    for (let i = 0; i < list.fnArray.length; i++) ops.push({ fn: list.fnArray[i]!, args: (list.argsArray[i] ?? []) as unknown[] });

    const conv = new PageConverter(lib, page, optionalContent, opts);
    await conv.run(ops);
    const notes: string[] = [];
    let rasterised = false;
    let { defs, content } = conv.body();
    const root = `<g${transformAttr(viewport.transform)}>`;
    const background = opts.background ? `<rect width="${n(width)}" height="${n(height)}" fill="#ffffff"/>` : '';

    if (conv.unsupported.size) {
      rasterised = true;
      const what = [...conv.unsupported].join(', ');
      notes.push(`This page uses ${what}, which SVG cannot reproduce exactly, so it is saved as a picture inside the SVG. Its text is still selectable.`);
      const scale = renderScale(width, height, opts.maxRasterPixels);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available in this browser.');
      await page.render({ canvas, canvasContext: ctx, viewport: page.getViewport({ scale }) }).promise;
      const uri = await canvasDataUri(canvas, 'image/png');
      canvas.width = canvas.height = 0;
      content = `<image xlink:href="${uri}" width="${n(width)}" height="${n(height)}" preserveAspectRatio="none"/>${root}${conv.selectableOnly()}</g>`;
      defs = '';
      const svg = wrap(width, height, '', background + content);
      return { svg, notes, rasterised, imageOnly: false, width, height };
    }

    const imageOnly = conv.paintedImages > 0 && conv.paintedOther === 0 && conv.visibleText === 0;
    if (imageOnly) notes.push('This page is a scan: one picture and no text, so the SVG holds the picture. Run OCR PDF first if you need selectable text.');
    if (conv.fontFallbackNames.length) {
      notes.push(`The font${conv.fontFallbackNames.length > 1 ? 's' : ''} ${conv.fontFallbackNames.join(', ')} ${conv.fontFallbackNames.length > 1 ? 'are' : 'is'} not stored in the PDF, so that text is live text in the closest font on the viewer's device.`);
    }
    const svg = wrap(width, height, defs ? `<defs>${defs}</defs>` : '', `${background}${root}${content}</g>`);
    return { svg, notes, rasterised, imageOnly, width, height };
  } finally {
    page.cleanup();
  }
}

function wrap(width: number, height: number, defs: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}">` +
    `${defs}${body}</svg>\n`
  );
}
