/**
 * Barcode rules, with no DOM and no barcode library: which characters and
 * lengths each type takes, the check digits, the ISBN-10 conversion and the
 * exact wording of every message. src/tools/barcode-generator.ts draws what
 * this module accepts with JsBarcode. Messages echo the typed character, so
 * show them with textContent.
 */

export type Symbology = 'code128' | 'code39' | 'upca' | 'upce' | 'ean13' | 'ean8' | 'itf14' | 'itf' | 'isbn';
export type JsBarcodeFormat = 'CODE128' | 'CODE39' | 'UPC' | 'UPCE' | 'EAN13' | 'EAN8' | 'ITF14' | 'ITF';

/** The dropdown: value, label and an example that is a valid number for the type. */
export const SYMBOLOGIES: { id: Symbology; label: string; example: string }[] = [
  { id: 'code128', label: 'Code 128', example: 'Stayput 12345' },
  { id: 'code39', label: 'Code 39', example: 'STAYPUT-123' },
  { id: 'upca', label: 'UPC-A', example: '012345678905' },
  { id: 'upce', label: 'UPC-E', example: '01234565' },
  { id: 'ean13', label: 'EAN-13', example: '5901234123457' },
  { id: 'ean8', label: 'EAN-8', example: '55123457' },
  { id: 'itf14', label: 'ITF-14', example: '15901234123454' },
  { id: 'itf', label: 'ITF (Interleaved 2 of 5)', example: '12345678' },
  { id: 'isbn', label: 'ISBN (book)', example: '9780306406157' },
];

export interface BarcodeOk {
  ok: true;
  format: JsBarcodeFormat;
  /** The full value for JsBarcode, check digit or character included. */
  value: string;
  /** Info-line sentences, joined with a space. Empty when there is nothing to say. */
  note: string;
}
export interface BarcodeErr {
  ok: false;
  /** Empty for an empty field: the empty state, no message. */
  message: string;
}

/** Longest Code 128, Code 39 and ITF value this page draws. */
export const MAX_LENGTH = 80;
/** The widest canvas this page draws, in pixels. */
export const MAX_WIDTH_PX = 16000;

const FORMAT: Record<Symbology, JsBarcodeFormat> = {
  code128: 'CODE128',
  code39: 'CODE39',
  upca: 'UPC',
  upce: 'UPCE',
  ean13: 'EAN13',
  ean8: 'EAN8',
  itf14: 'ITF14',
  itf: 'ITF',
  isbn: 'EAN13',
};

const TYPE_NAME: Record<string, string> = { upca: 'UPC-A', upce: 'UPC-E', ean13: 'EAN-13', ean8: 'EAN-8', itf14: 'ITF-14', itf: 'ITF' };

const CODE39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';

/** The typed character, described so that whitespace and control characters read as words. */
function describe(c: string): string {
  if (c === '\n' || c === '\r' || c === ' ' || c === ' ') return 'a line break';
  if (c === '\t') return 'a tab';
  const code = c.codePointAt(0)!;
  if (code < 0x20 || code === 0x7f) return 'a control character';
  return `“${c}”`;
}

/** First character of `text` that is not in `allowed`, as a whole code point. */
function firstOutside(text: string, allowed: (c: string) => boolean): string | undefined {
  for (const c of text) if (!allowed(c)) return c;
  return undefined;
}

const isDigit = (c: string) => c >= '0' && c <= '9';

/** GTIN check digit: weights 3, 1, 3, 1 … counted from the rightmost digit of `body`. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/** Code 39 mod 43 check character of a capitalised value. */
export function code39CheckChar(value: string): string {
  let sum = 0;
  for (const c of value) sum += CODE39_CHARS.indexOf(c);
  return CODE39_CHARS[sum % 43]!;
}

/** UPC-E middle digits plus number system to the UPC-A the check digit comes from. */
const EXPANSIONS = ['XX00000XXX', 'XX10000XXX', 'XX20000XXX', 'XXX00000XX', 'XXXX00000X', 'XXXXX00005', 'XXXXX00006', 'XXXXX00007', 'XXXXX00008', 'XXXXX00009'];
export function upceCheckDigit(system: string, middle: string): number {
  const pattern = EXPANSIONS[Number(middle[5])]!;
  let i = 0;
  let upca = system;
  for (const c of pattern) upca += c === 'X' ? middle[i++] : c;
  return gtinCheckDigit(upca);
}

/** ISBN-10 check character for its first nine digits: 0 to 9 or X. */
function isbn10Check(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i);
  const c = (11 - (sum % 11)) % 11;
  return c === 10 ? 'X' : String(c);
}

const err = (message: string): BarcodeErr => ({ ok: false, message });
const ok = (symbology: Symbology, value: string, notes: string[] = []): BarcodeOk => ({ ok: true, format: FORMAT[symbology], value, note: notes.join(' ') });

/** Validate what was typed for a barcode type, add the check digit, and say what is wrong in words. */
export function checkBarcode(symbology: Symbology, raw: string, opts: { mod43?: boolean } = {}): BarcodeOk | BarcodeErr {
  let text = raw.trim();
  if (!text) return err('');

  if (symbology === 'code128') {
    const bad = firstOutside(text, (c) => c >= ' ' && c <= '~');
    if (bad !== undefined) return err(`Code 128 here takes standard keyboard characters: letters, digits, punctuation and space. ${describe(bad)} is not one of them.`);
    const n = [...text].length;
    if (n > MAX_LENGTH) return err(`Too long: this page draws up to ${MAX_LENGTH} characters of Code 128, and you typed ${n}.`);
    return ok('code128', text);
  }

  if (symbology === 'code39') {
    const upper = text.replace(/[a-z]/g, (c) => c.toUpperCase());
    const lowered = upper !== text;
    text = upper;
    if (text.includes('*')) return err('Leave out the * characters: Code 39 adds its own start and stop *.');
    const bad = firstOutside(text, (c) => CODE39_CHARS.includes(c));
    if (bad !== undefined) return err(`Code 39 cannot hold ${describe(bad)}. It takes capitals, digits, space and - . $ / + %.`);
    const n = [...text].length;
    if (n > MAX_LENGTH) return err(`Too long: this page draws up to ${MAX_LENGTH} characters of Code 39, and you typed ${n}.`);
    const notes: string[] = [];
    if (lowered) notes.push('Letters were changed to capitals, because Code 39 has no lowercase.');
    let value = text;
    if (opts.mod43) {
      const c = code39CheckChar(text);
      value = text + c;
      notes.push(`Check character added: ${c}.`);
    }
    return ok('code39', value, notes);
  }

  // The rest are digit types: spaces and hyphens are ignored.
  text = text.replace(/[ -]/g, '');
  const n = [...text].length;

  if (symbology === 'isbn') return checkIsbn(text, n);

  const name = TYPE_NAME[symbology]!;
  const bad = firstOutside(text, isDigit);
  if (bad !== undefined) return err(`${name} takes digits only. ${describe(bad)} is not a digit.`);

  if (symbology === 'itf') {
    if (n > MAX_LENGTH) return err(`Too long: this page draws up to ${MAX_LENGTH} digits of ITF, and you typed ${n}.`);
    if (n % 2 !== 0) return err(`ITF needs an even number of digits, because it writes them two at a time. You typed ${n}.`);
    return ok('itf', text);
  }

  if (symbology === 'upce') {
    if (n === 6) {
      const d = upceCheckDigit('0', text);
      const full = `0${text}${d}`;
      return ok('upce', full, [`Check digit added: ${d}. The barcode number is ${full}.`]);
    }
    if (n === 8 && (text[0] === '0' || text[0] === '1')) {
      const d = upceCheckDigit(text[0]!, text.slice(1, 7));
      if (String(d) !== text[7]) return err('The last digit does not fit the other digits of this UPC-E number. Check the digits you copied, or type the 6 middle digits and let the page add the rest.');
      return ok('upce', text, [`Check digit ${d} is correct.`]);
    }
    return err(`UPC-E needs 6 digits, or 8 digits that start with 0 or 1. You typed ${n}.`);
  }

  // UPC-A, EAN-13, EAN-8, ITF-14: the page adds the last digit or verifies it.
  const full = { upca: 12, ean13: 13, ean8: 8, itf14: 14 }[symbology];
  const ordinal = { upca: '12th', ean13: '13th', ean8: '8th', itf14: '14th' }[symbology];
  if (n !== full && n !== full - 1) return err(`${name} needs ${full - 1} digits (the page adds the ${ordinal}) or all ${full}. You typed ${n}.`);
  const body = text.slice(0, full - 1);
  const d = gtinCheckDigit(body);
  if (n === full - 1) return ok(symbology, body + d, [`Check digit added: ${d}. The barcode number is ${body}${d}.`]);
  if (String(d) !== text[full - 1]) return err(`The last digit of this ${name} number should be ${d}, not ${text[full - 1]}. Fix it, or delete it and the page adds the right one.`);
  return ok(symbology, text, [`Check digit ${d} is correct.`]);
}

function checkIsbn(text: string, n: number): BarcodeOk | BarcodeErr {
  if (n === 13) {
    const bad = firstOutside(text, isDigit);
    if (bad !== undefined) return err(`ISBN-13 takes digits only. ${describe(bad)} is not a digit.`);
    const prefix = text.slice(0, 3);
    if (prefix !== '978' && prefix !== '979') return err(`ISBN-13s start with 978 or 979. This number starts with ${prefix}, so it is an ordinary product number. Use the EAN-13 type for it.`);
    const d = gtinCheckDigit(text.slice(0, 12));
    if (String(d) !== text[12]) return err(`This ISBN-13 ends in ${text[12]}, but its check digit should be ${d}. Check the digits against the book.`);
    return ok('isbn', text, [`Check digit ${d} is correct.`]);
  }
  if (n === 10) {
    const first9 = text.slice(0, 9);
    const last = text[9]!.toUpperCase();
    const badFirst = firstOutside(first9, isDigit);
    if (badFirst !== undefined) return err(`An ISBN-10 is nine digits and a last character that can be X. ${describe(badFirst)} is not allowed.`);
    if (!isDigit(last) && last !== 'X') return err(`An ISBN-10 is nine digits and a last character that can be X. ${describe(text[9]!)} is not allowed.`);
    const d = isbn10Check(first9);
    if (d !== last) return err(`This ISBN-10 ends in ${last}, but its check digit should be ${d}. Check the digits against the book.`);
    const body = `978${first9}`;
    const full = body + gtinCheckDigit(body);
    return ok('isbn', full, [`ISBN-10 converted to ISBN-13: ${full}.`]);
  }
  return err(`An ISBN has 13 digits (starting 978 or 979) or 10 characters. You typed ${n}.`);
}

/** The message for a barcode that would be wider than the page draws, or '' when it fits. */
export function widthError(modules: number, barPx: number, quietPx: number): string {
  const w = modules * barPx + 2 * quietPx;
  return w > MAX_WIDTH_PX ? `This barcode would be ${w} px wide, which is more than a browser can draw reliably. Use a smaller bar width or shorter text.` : '';
}

/** `barcode-<type>-<value>`: the value lowercased, runs of other characters turned into -, cut to 40. */
export function barcodeName(symbology: Symbology, value: string): string {
  const v = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return v ? `barcode-${symbology}-${v}` : `barcode-${symbology}`;
}
