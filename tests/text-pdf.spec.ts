import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  TEXT_ERRORS,
  autoFont,
  buildDocDefinition,
  classifyChar,
  decodeText,
  defaultFontSize,
  expandTabs,
  looksBinary,
  normaliseText,
  paperForLocale,
  titleFileName,
  undrawableNote,
} from '../src/lib/text-pdf';
import { MONO_RANGES, ROBOTO_RANGES } from '../src/lib/text-pdf-coverage';

const cls = (s: string) => Array.from(s, (c) => classifyChar(c.codePointAt(0)!));
const bytes = (...n: number[]) => new Uint8Array(n);
const utf16le = (s: string, bom = true) => {
  const out: number[] = bom ? [0xff, 0xfe] : [];
  for (const u of s) out.push(u.charCodeAt(0) & 0xff, u.charCodeAt(0) >> 8);
  return new Uint8Array(out);
};
const opts = { paper: 'a4' as const, margin: 72, font: 'sans' as const, fontSize: 11, title: '', numbers: true };

test('decodeText reads UTF-8 with and without a byte-order mark', () => {
  const body = new TextEncoder().encode('Grüße, Ελλάδα');
  expect(decodeText(body).text).toBe('Grüße, Ελλάδα');
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
  expect(decodeText(withBom)).toMatchObject({ text: 'Grüße, Ελλάδα', encoding: 'utf-8', fellBack: false });
});

test('decodeText reads UTF-16 with a mark in either order and without one', () => {
  expect(decodeText(utf16le('Hello Ελλάδα')).text).toBe('Hello Ελλάδα');
  const be = new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x69]);
  expect(decodeText(be)).toMatchObject({ text: 'Hi', encoding: 'utf-16be' });
  expect(decodeText(utf16le('Plain English text without a mark.', false))).toMatchObject({ text: 'Plain English text without a mark.', encoding: 'utf-16le' });
});

test('decodeText falls back to Windows-1252 and says so, and a forced UTF-8 never throws', () => {
  const latin = bytes(0x63, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x68, 0x69, 0x94);
  expect(decodeText(latin)).toEqual({ text: 'café “hi”', encoding: 'windows-1252', fellBack: true });
  const forced = decodeText(latin, 'utf-8');
  expect(forced.text).toContain('�');
  expect(forced.fellBack).toBe(false);
  expect(decodeText(latin, 'windows-1252').fellBack).toBe(false);
});

test('looksBinary spots the signatures of files that are not text', () => {
  expect(looksBinary(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true);
  expect(looksBinary(bytes(0x50, 0x4b, 0x03, 0x04, 0))).toBe(true);
  expect(looksBinary(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
  expect(looksBinary(new TextEncoder().encode('Hello'))).toBe(false);
  expect(looksBinary(utf16le('Hi'))).toBe(false);
});

test('normaliseText unifies line endings, marks form feeds, drops controls and trims the end', () => {
  const n = normaliseText('one\r\ntwo\rthree\fnew page\n\u0000​four  \n\n\n');
  expect(n.lines.map((l) => l.text)).toEqual(['one', 'two', 'three', 'new page', 'four']);
  expect(n.lines[3]!.pageBreak).toBe(true);
  expect(n.lines.filter((l) => l.pageBreak)).toHaveLength(1);
  expect(n.controls).toBe(1);
  expect(n.visible).toBe('onetwothreenewpagefour'.length);
  // Accents typed as letter plus combining mark become one letter the fonts have.
  expect(normaliseText('é').lines[0]!.text).toBe('é');
});

test('expandTabs goes to the next multiple of four columns', () => {
  expect(expandTabs('a\tb')).toBe('a   b');
  expect(expandTabs('\tx')).toBe('    x');
  expect(expandTabs('abcd\te')).toBe('abcd    e');
  expect(expandTabs('no tabs')).toBe('no tabs');
});

test('classifyChar: Roboto letters are sans, symbols only DejaVu has are mono, scripts neither font has are none', () => {
  expect(cls('éЖωạ€')).toEqual(['sans', 'sans', 'sans', 'sans', 'sans']);
  expect(cls('→✓├█')).toEqual(['mono', 'mono', 'mono', 'mono']);
  expect(cls('中あ한😀אاก')).toEqual(Array(7).fill('none'));
  expect(classifyChar(0xfffd)).toBe('none');
});

test('buildDocDefinition makes one node per line, mixes fonts for symbols, and counts what cannot be drawn', () => {
  const lines = normaliseText('Price → 5 ✓\n\n  indented 中文 😀\n👨‍👩‍👧 family\nplain').lines;
  const built = buildDocDefinition(lines, opts);
  const content = built.def.content as { text: unknown }[];
  expect(content).toHaveLength(5);
  expect(content[1]!.text).toBe('');
  expect(content[4]!.text).toBe('plain');
  expect(content[0]!.text).toEqual(['Price ', { text: '→', font: 'Mono' }, ' 5 ', { text: '✓', font: 'Mono' }]);
  expect(built.usesMono).toBe(true);
  // 中, 文, 😀 and the family sequence (one picture).
  expect(built.undrawable.count).toBe(4);
  expect(built.undrawable.scripts).toEqual(expect.arrayContaining(['Chinese or Japanese', 'emoji']));
  expect(JSON.stringify(content[2]!.text)).toContain('�');
  const note = undrawableNote(built.undrawable);
  expect(note).toContain("4 characters can't be drawn");
  expect(note).toContain('U+4E2D');
  expect(built.mostlyUndrawable).toBe(false);
});

test('a file that is mostly CJK is flagged to be refused, a mostly Latin one with a few CJK words is not', () => {
  const cjk = buildDocDefinition(normaliseText('中'.repeat(60) + ' hello').lines, opts);
  expect(cjk.mostlyUndrawable).toBe(true);
  const mixed = buildDocDefinition(normaliseText('A short note with a few words and one 中文 mention in it.').lines, opts);
  expect(mixed.mostlyUndrawable).toBe(false);
});

test('plain text with no symbols uses no monospace font; monospace mode uses it throughout', () => {
  const lines = normaliseText('just ascii').lines;
  expect(buildDocDefinition(lines, opts).usesMono).toBe(false);
  const mono = buildDocDefinition(lines, { ...opts, font: 'mono', fontSize: 9 });
  expect(mono.usesMono).toBe(true);
  expect((mono.def.defaultStyle as { font: string }).font).toBe('Mono');
});

test('a title is printed first and the page size follows the option', () => {
  const built = buildDocDefinition(normaliseText('body').lines, { ...opts, paper: 'letter', title: 'My notes' });
  expect(built.def.pageSize).toBe('LETTER');
  expect((built.def.content as { text: unknown }[])[0]!.text).toBe('My notes');
  expect((built.def.info as { title: string }).title).toBe('My notes');
});

test('autoFont picks monospace for data, logs and aligned columns, and sans for prose and typed text', () => {
  const prose = normaliseText('A paragraph of ordinary prose.\nAnother sentence follows it.').lines;
  const columns = normaliseText('name    qty   price\napple   3     1.20\npear    10    0.90').lines;
  expect(autoFont('notes.txt', prose, false)).toBe('sans');
  expect(autoFont('server.log', prose, false)).toBe('mono');
  expect(autoFont('data.csv', prose, false)).toBe('mono');
  expect(autoFont('table.txt', columns, false)).toBe('mono');
  expect(autoFont('text.txt', columns, true)).toBe('sans');
  expect(defaultFontSize('mono')).toBe(9);
  expect(defaultFontSize('sans')).toBe(11);
});

test('paperForLocale gives Letter for the US, Canada, Mexico and the Philippines and A4 elsewhere', () => {
  for (const l of ['en-US', 'en-CA', 'es-MX', 'fil-PH', 'en_US']) expect(paperForLocale(l), l).toBe('letter');
  for (const l of ['de-DE', 'en-GB', 'fr', undefined, '']) expect(paperForLocale(l), String(l)).toBe('a4');
});

test('titleFileName keeps letters, digits, spaces, hyphens and underscores', () => {
  expect(titleFileName('Q3: Notes / draft?')).toBe('Q3 Notes draft');
  expect(titleFileName('Überschrift_1')).toBe('Überschrift_1');
  expect(titleFileName('???')).toBe('');
});

test('the error copy carries no phrase the claims record forbids', () => {
  const copy = [TEXT_ERRORS.empty, TEXT_ERRORS.noText('a.txt'), TEXT_ERRORS.tooLarge('a.txt', '3 MB'), TEXT_ERRORS.notText('a.txt'), TEXT_ERRORS.mostlyUndrawable('a.txt'), TEXT_ERRORS.workerFailed].join(' ');
  expect(copy).not.toMatch(/\b(any device|every device|unlimited|no data|zero requests|nothing is sent|no tracking|ffmpeg)\b/i);
  expect(TEXT_ERRORS.tooLarge('a.txt', '3 MB')).toContain('up to 2 MB');
});

// --- The coverage lists must match the font files ------------------------------------------

const require = createRequire(import.meta.url);

function codePoints(ranges: string): Set<number> {
  const out = new Set<number>();
  for (const r of ranges.split(' ')) {
    const [a, b = a] = r.split('-').map((h) => parseInt(h, 16));
    for (let c = a!; c <= b!; c++) out.add(c);
  }
  return out;
}

test('the coverage lists match the Roboto and DejaVu files exactly', () => {
  const fontkit = require('fontkit');
  const create: (b: Buffer) => { characterSet: number[] } = fontkit.create ?? fontkit.default.create;
  const vfs = require('pdfmake/build/vfs_fonts.js') as Record<string, string | { data: string }>;
  const raw = vfs['Roboto-Regular.ttf']!;
  const roboto = create(Buffer.from(typeof raw === 'string' ? raw : raw.data, 'base64'));
  const mono = create(readFileSync(new URL('../public/fonts/DejaVuSansMono-subset.ttf', import.meta.url)));
  for (const [name, font, ranges] of [['Roboto', roboto, ROBOTO_RANGES], ['DejaVu Sans Mono', mono, MONO_RANGES]] as const) {
    const claimed = codePoints(ranges);
    const inFile = new Set(font.characterSet.filter((c) => c >= 0x20 && c <= 0xffff));
    expect([...claimed].filter((c) => !inFile.has(c)), `${name}: claimed but not in the font`).toEqual([]);
    expect([...inFile].filter((c) => !claimed.has(c)), `${name}: in the font but not claimed`).toEqual([]);
  }
});
