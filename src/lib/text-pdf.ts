/**
 * Text to PDF, the parts that need no page: reading a text file whatever its encoding, tidying
 * it (line endings, tabs, form feeds), checking which characters the two PDF fonts can draw,
 * and building the pdfmake document. pdfmake silently drops a character its font has no shape
 * for, so every such character is replaced by U+FFFD here and counted, never lost unseen.
 */
import { MONO_RANGES, ROBOTO_RANGES } from './text-pdf-coverage';

/** Memory sets this: a PDF this size is about 300 pages and 400 MB while it is laid out. */
export const MAX_TEXT_BYTES = 2_000_000;
/** Above this share of the visible characters being undrawable, the PDF would be a page of marks. */
const REFUSE_SHARE = 0.5;
const TAB_WIDTH = 4;
const SAMPLES = 8;

export type EncodingChoice = 'auto' | 'utf-8' | 'utf-16' | 'windows-1252';
export type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';
export type FontChoice = 'sans' | 'mono';
export type CharClass = 'sans' | 'mono' | 'none';

export interface Decoded {
  text: string;
  encoding: Encoding;
  /** The bytes were not valid UTF-8 and were read as Windows-1252 instead. */
  fellBack: boolean;
}

export const TEXT_ERRORS = {
  noText: (name: string) => `${name} has no text in it.`,
  empty: 'Type or paste some text first.',
  tooLarge: (name: string, size: string) =>
    `${name} is ${size}. Text to PDF handles up to 2 MB of text per file, about 300 pages, so this tab does not run out of memory. Split the file into parts and convert each one.`,
  notText: (name: string) => `${name} does not look like plain text. It may be a Word document, a PDF or another binary file. This tool reads plain text files.`,
  mostlyUndrawable: (name: string) =>
    `${name} is mostly in a script the built-in fonts cannot draw (Chinese, Japanese, Korean, Arabic, Hebrew, Thai or an Indian script, or emoji), so the PDF would be a page of � marks. To make a PDF with your device’s own fonts, open the text in your browser and use Print, then Save as PDF.`,
  workerFailed: 'The PDF could not be made. Try a smaller file or fewer pages.',
};

// ---- Reading the bytes ------------------------------------------------------------------

const MAGIC: number[][] = [
  [0x25, 0x50, 0x44, 0x46], // %PDF
  [0x50, 0x4b, 0x03, 0x04], // zip: docx, xlsx, epub
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0x47, 0x49, 0x46, 0x38], // GIF8
  [0xff, 0xd8, 0xff], // JPEG
];

/** Files that begin with the signature of a PDF, zip, PNG, GIF or JPEG are not text. */
export function looksBinary(bytes: Uint8Array): boolean {
  return MAGIC.some((m) => m.every((b, i) => bytes[i] === b));
}

function utf16(bytes: Uint8Array, bigEndian: boolean, skip: number): string {
  const n = (bytes.length - skip) & ~1;
  const units = new Uint16Array(n / 2);
  for (let i = 0; i < units.length; i++) {
    const a = bytes[skip + i * 2]!;
    const b = bytes[skip + i * 2 + 1]!;
    units[i] = bigEndian ? (a << 8) | b : a | (b << 8);
  }
  let out = '';
  for (let i = 0; i < units.length; i += 0x8000) out += String.fromCharCode(...units.subarray(i, i + 0x8000));
  // Lone surrogates would throw in later string handling; make them replacement characters.
  return out.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

/** What Windows-1252 puts at 0x80 to 0x9F (Latin-1 has control codes there); five of them are unassigned. */
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';

/** Windows-1252 by table, so every browser and Node agree on the curly quotes and the euro sign. */
function windows1252(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += Array.from(bytes.subarray(i, i + 0x8000), (b) => (b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80]! : String.fromCharCode(b))).join('');
  }
  return out;
}

/** UTF-16 without a byte-order mark: English text in it has a zero in every other byte. */
function sniffUtf16(bytes: Uint8Array): 'le' | 'be' | undefined {
  const n = Math.min(bytes.length, 4096) & ~1;
  if (n < 4) return undefined;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) even++;
    if (bytes[i + 1] === 0) odd++;
  }
  const pairs = n / 2;
  if (odd >= pairs * 0.3 && even <= pairs * 0.05) return 'le';
  if (even >= pairs * 0.3 && odd <= pairs * 0.05) return 'be';
  return undefined;
}

/** Read text from bytes: a byte-order mark, then UTF-8, then UTF-16 without a mark, then Windows-1252. */
export function decodeText(bytes: Uint8Array, choice: EncodingChoice = 'auto'): Decoded {
  const bom8 = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const bomLe = bytes[0] === 0xff && bytes[1] === 0xfe;
  const bomBe = bytes[0] === 0xfe && bytes[1] === 0xff;
  if (choice === 'windows-1252') return { text: windows1252(bytes), encoding: 'windows-1252', fellBack: false };
  if (choice === 'utf-16') {
    const be = bomBe || (!bomLe && sniffUtf16(bytes) === 'be');
    return { text: utf16(bytes, be, bomLe || bomBe ? 2 : 0), encoding: be ? 'utf-16be' : 'utf-16le', fellBack: false };
  }
  if (choice === 'auto') {
    if (bomLe) return { text: utf16(bytes, false, 2), encoding: 'utf-16le', fellBack: false };
    if (bomBe) return { text: utf16(bytes, true, 2), encoding: 'utf-16be', fellBack: false };
  }
  const body = bom8 ? bytes.subarray(3) : bytes;
  if (choice === 'utf-8') return { text: new TextDecoder('utf-8').decode(body), encoding: 'utf-8', fellBack: false };
  // Mostly-zero alternate bytes are valid UTF-8 too, so UTF-16 without a mark is looked for first.
  const guess = bom8 ? undefined : sniffUtf16(bytes);
  if (guess) return { text: utf16(bytes, guess === 'be', 0), encoding: guess === 'be' ? 'utf-16be' : 'utf-16le', fellBack: false };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8', fellBack: false };
  } catch {
    return { text: windows1252(bytes), encoding: 'windows-1252', fellBack: true };
  }
}

// ---- Tidying the text -------------------------------------------------------------------

/** Expand tabs to the next multiple of `width` columns, counting from the start of the line. */
export function expandTabs(line: string, width = TAB_WIDTH): string {
  if (!line.includes('\t')) return line;
  let out = '';
  let col = 0;
  for (const ch of line) {
    if (ch === '\t') {
      const n = width - (col % width);
      out += ' '.repeat(n);
      col += n;
    } else {
      out += ch;
      col++;
    }
  }
  return out;
}

export interface TextLine {
  text: string;
  /** A form feed came just before this line: it starts a page. */
  pageBreak?: boolean;
}

export interface Normalised {
  lines: TextLine[];
  /** Control characters that were removed. */
  controls: number;
  /** Characters kept, spaces not counted. */
  visible: number;
}

// C0 controls except tab, line feed and form feed (carriage returns are gone by then), and DEL.
const CONTROLS = /[\x00-\x08\x0B\x0E-\x1F\x7F]/g;
// Zero-width characters with no shape, and the soft hyphen. ZWJ and variation selectors stay until drawing.
const INVISIBLE = /[​‌⁠﻿­]/g;

export function normaliseText(raw: string): Normalised {
  let text = raw.replace(/\r\n?/g, '\n').replace(INVISIBLE, '');
  let controls = 0;
  text = text.replace(CONTROLS, () => (controls++, ''));
  // Accents typed as a letter plus a combining mark become one letter the fonts have.
  if (/[^\x00-\x7F]/.test(text)) text = text.normalize('NFC');
  const lines: TextLine[] = [];
  for (const source of text.split('\n')) {
    const parts = source.split('\f');
    for (const [i, part] of parts.entries()) {
      const line: TextLine = { text: expandTabs(part).trimEnd() };
      if (i > 0 && lines.length > 0) line.pageBreak = true;
      lines.push(line);
    }
  }
  while (lines.length > 0 && lines.at(-1)!.text === '') lines.pop();
  let visible = 0;
  for (const l of lines) visible += l.text.replace(/\s/g, '').length;
  return { lines, controls, visible };
}

// ---- Which font draws which character ---------------------------------------------------

function table(ranges: string): Uint8Array {
  const t = new Uint8Array(0x10000);
  for (const r of ranges.split(' ')) {
    const [a, b = a] = r.split('-').map((h) => parseInt(h, 16));
    for (let c = a!; c <= b!; c++) t[c] = 1;
  }
  return t;
}

const ROBOTO = table(ROBOTO_RANGES);
const MONO = table(MONO_RANGES);
const REPLACEMENT = 0xfffd;

/** Marks that join or modify a letter without a shape of their own: left out of the page when the rest can be drawn. */
const isJoiner = (cp: number) => cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f);

/** Which font draws a code point: Roboto (`sans`), only the DejaVu subset (`mono`), or neither. */
export function classifyChar(cp: number): CharClass {
  if (cp === REPLACEMENT || cp > 0xffff) return 'none';
  if (ROBOTO[cp]) return 'sans';
  if (MONO[cp]) return 'mono';
  return 'none';
}

const inFont = (cp: number, font: 'Roboto' | 'Mono') => cp <= 0xffff && cp !== REPLACEMENT && (font === 'Roboto' ? ROBOTO[cp] : MONO[cp]) === 1;

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : undefined;
const graphemes = (s: string): string[] => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));

const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Name the script of a character the fonts cannot draw. */
export function scriptName(ch: string): string {
  if (PICTOGRAPH.test(ch)) return 'emoji';
  if (/\p{Script=Han}/u.test(ch)) return 'Chinese or Japanese';
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)) return 'Japanese';
  if (/\p{Script=Hangul}/u.test(ch)) return 'Korean';
  if (/\p{Script=Arabic}/u.test(ch)) return 'Arabic';
  if (/\p{Script=Hebrew}/u.test(ch)) return 'Hebrew';
  if (/\p{Script=Thai}/u.test(ch)) return 'Thai';
  if (/[\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}]/u.test(ch)) return 'Indian scripts';
  if (ch === '�') return 'bytes that are not valid text';
  return 'other symbols and scripts';
}

export interface Undrawable {
  /** Characters (emoji sequences count once) shown as �. */
  count: number;
  /** The first few distinct ones, as they were written. */
  samples: string[];
  scripts: string[];
}

type Run = string | { text: string; font: string };
export type PdfNode = { text: string | Run[]; preserveLeadingSpaces: true; pageBreak?: 'before' };

class Layout {
  readonly sample = new Set<string>();
  readonly scripts = new Set<string>();
  count = 0;
  /** Visible characters (clusters), and how many of them are undrawable. */
  seen = 0;
  usesMono = false;
  usesRoboto = false;

  constructor(private readonly font: FontChoice) {}

  private get main(): 'Roboto' | 'Mono' {
    return this.font === 'mono' ? 'Mono' : 'Roboto';
  }

  private miss(ch: string) {
    this.count++;
    if (this.sample.size < SAMPLES) this.sample.add(ch);
    this.scripts.add(scriptName(ch));
  }

  /** Font for a code point: the chosen one when it has it, the other as a fallback, else undefined. */
  private fontFor(cp: number): 'Roboto' | 'Mono' | undefined {
    const main = this.main;
    if (inFont(cp, main)) return main;
    const other = main === 'Roboto' ? 'Mono' : 'Roboto';
    return inFont(cp, other) ? other : undefined;
  }

  line(text: string): string | Run[] {
    if (text === '') return '';
    // Plain ASCII is the common case and is all in both fonts.
    if (/^[\x20-\x7E]*$/.test(text)) {
      this.seen += text.replace(/ /g, '').length;
      if (this.main === 'Mono') this.usesMono = true;
      else this.usesRoboto = true;
      return text;
    }
    const runs: { font: string; text: string }[] = [];
    const push = (font: string, s: string) => {
      const last = runs.at(-1);
      if (last && last.font === font) last.text += s;
      else runs.push({ font, text: s });
    };
    const emit = (cp: number) => {
      const f = this.fontFor(cp);
      push(f ?? this.main, f ? String.fromCodePoint(cp) : '�');
    };
    // The simple pass handles any line whose characters are all drawable.
    let simple = true;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (!isJoiner(cp) && cp !== 0x20 && this.fontFor(cp) === undefined) {
        simple = false;
        break;
      }
    }
    if (simple) {
      for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        if (isJoiner(cp)) continue;
        if (cp !== 0x20) this.seen++;
        emit(cp);
      }
    } else {
      for (const g of graphemes(text)) {
        const cps = Array.from(g, (c) => c.codePointAt(0)!);
        const shown = cps.filter((c) => !isJoiner(c));
        if (shown.every((c) => c === 0x20 || this.fontFor(c) !== undefined)) {
          for (const c of shown) {
            if (c !== 0x20) this.seen++;
            emit(c);
          }
        } else if (PICTOGRAPH.test(g) || cps.includes(0x200d)) {
          // A flag or a family of emoji is one picture: one mark, counted once.
          this.seen++;
          this.miss(g);
          push(this.main, '�');
        } else {
          for (const c of shown) {
            if (c !== 0x20) this.seen++;
            if (c === 0x20 || this.fontFor(c) !== undefined) emit(c);
            else {
              this.miss(String.fromCodePoint(c));
              push(this.main, '�');
            }
          }
        }
      }
    }
    for (const r of runs) {
      if (r.font === 'Mono') this.usesMono = true;
      else this.usesRoboto = true;
    }
    if (runs.length === 1 && runs[0]!.font === this.main) return runs[0]!.text;
    return runs.map((r) => (r.font === this.main ? r.text : { text: r.text, font: r.font }));
  }

  result(): Undrawable {
    return { count: this.count, samples: [...this.sample], scripts: [...this.scripts] };
  }
}

// ---- Choosing the font and size ---------------------------------------------------------

const MONO_EXT = /\.(csv|tsv|log)$/i;

/** Mono for data and logs, and for text that lines columns up with spaces or tabs. */
export function autoFont(name: string, lines: TextLine[], typed: boolean): FontChoice {
  if (typed) return 'sans';
  if (MONO_EXT.test(name)) return 'mono';
  let nonEmpty = 0;
  let aligned = 0;
  for (const l of lines) {
    if (l.text === '') continue;
    nonEmpty++;
    // Tabs are already spaces here, so a run of two or more spaces after text is the mark.
    if (/\S {2,}\S/.test(l.text.trimStart())) aligned++;
  }
  return nonEmpty > 0 && aligned / nonEmpty >= 0.05 ? 'mono' : 'sans';
}

export type PaperChoice = 'a4' | 'letter';

export interface TextPdfOptions {
  paper: PaperChoice;
  /** Page margin in points, the same on all four sides. */
  margin: number;
  font: FontChoice;
  /** Points. */
  fontSize: number;
  title: string;
  numbers: boolean;
}

export const defaultFontSize = (font: FontChoice): number => (font === 'mono' ? 9 : 11);

/** A4 by default; US Letter where the browser's region is the US, Canada, Mexico or the Philippines. */
export function paperForLocale(locale: string | undefined): PaperChoice {
  const region = /[-_]([A-Za-z]{2})\b/.exec(locale ?? '')?.[1]?.toUpperCase();
  return region && ['US', 'CA', 'MX', 'PH'].includes(region) ? 'letter' : 'a4';
}

export interface Built {
  /** The pdfmake document definition: plain data, so it can be posted to the worker. */
  def: Record<string, unknown>;
  undrawable: Undrawable;
  /** The Mono font bytes are needed. */
  usesMono: boolean;
  /** Every visible character is undrawable beyond the refusal share. */
  mostlyUndrawable: boolean;
}

/** One pdfmake node per line: a single big text node is quadratic in pdfmake. */
export function buildDocDefinition(lines: TextLine[], opts: TextPdfOptions): Built {
  const layout = new Layout(opts.font);
  const title = opts.title.trim().slice(0, 120);
  const content: Record<string, unknown>[] = [];
  if (title) {
    content.push({ text: layout.line(title), bold: true, fontSize: opts.fontSize * 1.4, margin: [0, 0, 0, opts.fontSize * 0.8] });
  }
  for (const [i, l] of lines.entries()) {
    const node: PdfNode = { text: layout.line(l.text), preserveLeadingSpaces: true };
    if (l.pageBreak && i > 0) node.pageBreak = 'before';
    content.push(node);
  }
  const m = opts.margin;
  const def = {
    info: { title: title || undefined, creator: 'Stayput' },
    pageSize: opts.paper === 'letter' ? 'LETTER' : 'A4',
    pageMargins: [m, m, m, m + (opts.numbers ? 10 : 0)],
    defaultStyle: {
      font: opts.font === 'mono' ? 'Mono' : 'Roboto',
      fontSize: opts.fontSize,
      lineHeight: opts.font === 'mono' ? 1.2 : 1.3,
      alignment: 'left',
    },
    content,
  };
  return {
    def,
    undrawable: layout.result(),
    usesMono: layout.usesMono,
    mostlyUndrawable: layout.seen > 0 && layout.count / layout.seen > REFUSE_SHARE,
  };
}

// ---- Words for the result ---------------------------------------------------------------

const hex = (ch: string) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

/** "14 characters can't be drawn and show as � (Chinese or Japanese, emoji): 中 (U+4E2D), … and 6 more". */
export function undrawableNote(u: Undrawable): string {
  if (u.count === 0) return '';
  const word = u.count === 1 ? 'character' : 'characters';
  const shown = u.samples.map((s) => (s === '�' ? `� (${hex(s)})` : `${s} (${hex(s)})`));
  const more = u.count > u.samples.length ? ` and ${(u.count - u.samples.length).toLocaleString('en')} more` : '';
  return `${u.count.toLocaleString('en')} ${word} can't be drawn and show${u.count === 1 ? 's' : ''} as � (${u.scripts.join(', ')}): ${shown.join(', ')}${more}`;
}

/** A name for the PDF from the title: letters, digits, spaces, hyphens and underscores. */
export function titleFileName(title: string): string {
  const clean = title.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80).trim();
  return clean;
}
