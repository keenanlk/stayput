import { test, expect } from '@playwright/test';
import JsBarcode from 'jsbarcode';
import { checkBarcode, barcodeName, code39CheckChar, gtinCheckDigit, widthError, MAX_WIDTH_PX, SYMBOLOGIES, type Symbology } from '../src/lib/barcode';

// Pure rules, no browser: like qr.spec.ts, this imports the module directly.

const msg = (s: Symbology, raw: string, mod43 = false) => {
  const r = checkBarcode(s, raw, { mod43 });
  if (r.ok) throw new Error(`${s} ${raw} was accepted as ${r.value}`);
  return r.message;
};
const good = (s: Symbology, raw: string, mod43 = false) => {
  const r = checkBarcode(s, raw, { mod43 });
  if (!r.ok) throw new Error(`${s} ${raw}: ${r.message}`);
  return r;
};

test('check digits', () => {
  expect(gtinCheckDigit('400638133393')).toBe(1);
  expect(gtinCheckDigit('590123412345')).toBe(7);
  expect(gtinCheckDigit('978030640615')).toBe(7);
  expect(gtinCheckDigit('01234567890')).toBe(5);
  expect(gtinCheckDigit('03600029145')).toBe(2);
  expect(gtinCheckDigit('9638507')).toBe(4);
  expect(gtinCheckDigit('5512345')).toBe(7);
  expect(gtinCheckDigit('1234567890123')).toBe(1);
  expect(gtinCheckDigit('1590123412345')).toBe(4);
  expect(code39CheckChar('HELLO')).toBe('B');
  expect(code39CheckChar('CODE39')).toBe('W');
});

test('every example in the dropdown is accepted as typed', () => {
  expect(SYMBOLOGIES.map((s) => s.id)).toEqual(['code128', 'code39', 'upca', 'upce', 'ean13', 'ean8', 'itf14', 'itf', 'isbn']);
  for (const s of SYMBOLOGIES) expect(good(s.id, s.example).value, s.id).toBe(s.example);
});

test('normalising: whitespace, hyphens, capitals', () => {
  const upc = good('upca', ' 0 36000 29145 2\n');
  expect(upc.value).toBe('036000291452');
  expect(upc.note).toBe('Check digit 2 is correct.');
  expect(good('isbn', '978-0-306-40615-7').value).toBe('9780306406157');
  const c39 = good('code39', 'hello');
  expect(c39.value).toBe('HELLO');
  expect(c39.note).toBe('Letters were changed to capitals, because Code 39 has no lowercase.');
  expect(checkBarcode('ean13', '  \n')).toEqual({ ok: false, message: '' });
});

test('a missing check digit is added, a wrong one is named', () => {
  expect(good('upca', '03600029145').note).toBe('Check digit added: 2. The barcode number is 036000291452.');
  expect(good('upca', '03600029145').value).toBe('036000291452');
  expect(msg('upca', '036000291453')).toBe('The last digit of this UPC-A number should be 2, not 3. Fix it, or delete it and the page adds the right one.');
  expect(good('ean13', '400638133393').value).toBe('4006381333931');
  expect(msg('ean13', '4006381333932')).toBe('The last digit of this EAN-13 number should be 1, not 2. Fix it, or delete it and the page adds the right one.');
  expect(good('ean8', '9638507').value).toBe('96385074');
  expect(msg('ean8', '96385075')).toBe('The last digit of this EAN-8 number should be 4, not 5. Fix it, or delete it and the page adds the right one.');
  expect(good('itf14', '1234567890123').value).toBe('12345678901231');
  expect(msg('itf14', '12345678901232')).toBe('The last digit of this ITF-14 number should be 1, not 2. Fix it, or delete it and the page adds the right one.');
});

test('every length message', () => {
  expect(msg('upca', '1234567890')).toBe('UPC-A needs 11 digits (the page adds the 12th) or all 12. You typed 10.');
  expect(msg('upca', '1234567890123')).toBe('UPC-A needs 11 digits (the page adds the 12th) or all 12. You typed 13.');
  expect(msg('ean13', '12345678901')).toBe('EAN-13 needs 12 digits (the page adds the 13th) or all 13. You typed 11.');
  expect(msg('ean13', '12345678901234')).toBe('EAN-13 needs 12 digits (the page adds the 13th) or all 13. You typed 14.');
  expect(msg('ean8', '123456')).toBe('EAN-8 needs 7 digits (the page adds the 8th) or all 8. You typed 6.');
  expect(msg('ean8', '123456789')).toBe('EAN-8 needs 7 digits (the page adds the 8th) or all 8. You typed 9.');
  expect(msg('itf14', '123456789012')).toBe('ITF-14 needs 13 digits (the page adds the 14th) or all 14. You typed 12.');
  expect(msg('itf14', '123456789012345')).toBe('ITF-14 needs 13 digits (the page adds the 14th) or all 14. You typed 15.');
  expect(msg('itf', '123')).toBe('ITF needs an even number of digits, because it writes them two at a time. You typed 3.');
  expect(msg('itf', '12'.repeat(41))).toBe('Too long: this page draws up to 80 digits of ITF, and you typed 82.');
  expect(good('itf', '12'.repeat(40)).value).toHaveLength(80);
  expect(msg('upce', '1234567')).toBe('UPC-E needs 6 digits, or 8 digits that start with 0 or 1. You typed 7.');
  expect(msg('upce', '23456789')).toBe('UPC-E needs 6 digits, or 8 digits that start with 0 or 1. You typed 8.');
  expect(msg('isbn', '12345678901')).toBe('An ISBN has 13 digits (starting 978 or 979) or 10 characters. You typed 11.');
});

test('UPC-E: six digits get a number system and a check digit, eight are verified', () => {
  const six = good('upce', '012345');
  // JsBarcode shows 0 012345 7 for these six digits.
  expect(six.value).toBe('00123457');
  expect(six.note).toBe('Check digit added: 7. The barcode number is 00123457.');
  expect(good('upce', '01234565').value).toBe('01234565');
  expect(msg('upce', '01234567')).toBe('The last digit does not fit the other digits of this UPC-E number. Check the digits you copied, or type the 6 middle digits and let the page add the rest.');
});

test('digits only names the character', () => {
  expect(msg('ean13', '59012341234a')).toBe('EAN-13 takes digits only. “a” is not a digit.');
  expect(msg('ean13', '59012\t41234')).toBe('EAN-13 takes digits only. a tab is not a digit.');
  expect(msg('upca', '03600\n29145')).toBe('UPC-A takes digits only. a line break is not a digit.');
  expect(msg('itf', '12x4')).toBe('ITF takes digits only. “x” is not a digit.');
});

test('Code 39', () => {
  expect(msg('code39', 'AB*C')).toBe('Leave out the * characters: Code 39 adds its own start and stop *.');
  expect(msg('code39', 'hello!')).toBe('Code 39 cannot hold “!”. It takes capitals, digits, space and - . $ / + %.');
  expect(msg('code39', 'A'.repeat(81))).toBe('Too long: this page draws up to 80 characters of Code 39, and you typed 81.');
  expect(good('code39', 'A'.repeat(80)).value).toHaveLength(80);
  const m = good('code39', 'HELLO', true);
  expect(m.note).toBe('Check character added: B.');
  expect(m.value).toBe('HELLOB');
  expect(good('code39', 'a-b $/+%.', false).value).toBe('A-B $/+%.');
});

test('Code 128', () => {
  expect(good('code128', 'Stayput 12345').value).toBe('Stayput 12345');
  expect(good('code128', 'a'.repeat(80)).value).toHaveLength(80);
  expect(msg('code128', 'é')).toBe('Code 128 here takes standard keyboard characters: letters, digits, punctuation and space. “é” is not one of them.');
  expect(msg('code128', 'AB\nCD')).toBe('Code 128 here takes standard keyboard characters: letters, digits, punctuation and space. a line break is not one of them.');
  expect(msg('code128', 'a'.repeat(81))).toBe('Too long: this page draws up to 80 characters of Code 128, and you typed 81.');
});

test('ISBN', () => {
  const c = good('isbn', '0-306-40615-2');
  expect(c.value).toBe('9780306406157');
  expect(c.note).toBe('ISBN-10 converted to ISBN-13: 9780306406157.');
  expect(c.format).toBe('EAN13');
  expect(good('isbn', '0-8044-2957-X').value).toBe('9780804429573');
  expect(good('isbn', '0-8044-2957-x').value).toBe('9780804429573');
  expect(msg('isbn', '0306406153')).toBe('This ISBN-10 ends in 3, but its check digit should be 2. Check the digits against the book.');
  expect(msg('isbn', '0306406150')).toBe('This ISBN-10 ends in 0, but its check digit should be 2. Check the digits against the book.');
  expect(msg('isbn', '0804429579')).toBe('This ISBN-10 ends in 9, but its check digit should be X. Check the digits against the book.');
  expect(msg('isbn', '03064A6152')).toBe('An ISBN-10 is nine digits and a last character that can be X. “A” is not allowed.');
  expect(msg('isbn', '4006381333931')).toBe('ISBN-13s start with 978 or 979. This number starts with 400, so it is an ordinary product number. Use the EAN-13 type for it.');
  expect(msg('isbn', '9780306406158')).toBe('This ISBN-13 ends in 8, but its check digit should be 7. Check the digits against the book.');
  expect(good('isbn', '979-10-90636-07-1').note).toBe('Check digit 1 is correct.');
});

test('file names and the width guard', () => {
  expect(barcodeName('ean13', '5901234123457')).toBe('barcode-ean13-5901234123457');
  expect(barcodeName('code128', 'Hello World / 12')).toBe('barcode-code128-hello-world-12');
  expect(barcodeName('code39', 'A'.repeat(80))).toBe(`barcode-code39-${'a'.repeat(40)}`);
  expect(widthError(100, 3, 33)).toBe('');
  expect(widthError(MAX_WIDTH_PX, 1, 1)).toBe(`This barcode would be ${MAX_WIDTH_PX + 2} px wide, which is more than a browser can draw reliably. Use a smaller bar width or shorter text.`);
});

// The drift guard: what this module accepts must be what JsBarcode draws, and
// the check digit it works out must be the one JsBarcode would have added.
test('JsBarcode accepts everything checkBarcode accepts, with the same number', () => {
  let seed = 20261011;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join('');
  const chars = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('');
  const printable = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
  const code39 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%abcdefghijklmnopqrstuvwxyz';
  const draw = (format: string, value: string, mod43 = false) => {
    const out: { encodings?: { text: string }[] } = {};
    // mod43 is a CODE39 option the library's typings do not list.
    JsBarcode(out, value, { format, mod43 } as JsBarcode.Options);
    return (out.encodings ?? []).map((e) => e.text).join('');
  };
  const lengths: Record<string, number[]> = { upca: [11, 12], ean13: [12, 13], ean8: [7, 8], itf14: [13, 14], upce: [6, 8], itf: [2, 4, 8, 14, 80] };
  let seen = 0;
  for (let i = 0; i < 300; i++) {
    for (const s of ['upca', 'ean13', 'ean8', 'itf14', 'upce', 'itf'] as const) {
      const ns = i % 2; // UPC-E eight digits start with 0 or 1
      const n = lengths[s]![i % lengths[s]!.length]!;
      const raw = s === 'upce' && n === 8 ? `${ns}${digits(7)}` : digits(n);
      const r = checkBarcode(s, raw);
      if (!r.ok) continue;
      seen++;
      expect(() => JsBarcode({}, r.value, { format: r.format }), `${s} ${raw}`).not.toThrow();
      // JsBarcode adds the same check digit to the number without it, and keeps ours on the full number.
      if (['upca', 'ean13', 'ean8', 'itf14'].includes(s)) {
        expect(draw(r.format, r.value.slice(0, -1)), `${s} ${raw}`).toBe(r.value);
        expect(draw(r.format, r.value), `${s} ${raw}`).toBe(r.value);
      }
      if (s === 'upce' && n === 6) expect(draw('UPCE', raw).replace(/\D/g, ''), raw).toBe(r.value);
      // A wrong last digit is refused by both.
      if (['upca', 'ean13', 'ean8', 'itf14'].includes(s) && raw.length === lengths[s]![1]) {
        const wrong = raw.slice(0, -1) + String((Number(raw.at(-1)) + 1) % 10);
        expect(checkBarcode(s, wrong).ok, wrong).toBe(false);
        expect(() => JsBarcode({}, wrong, { format: r.format }), wrong).toThrow();
      }
    }
    const c128 = checkBarcode('code128', chars(printable, 1 + (i % 80)));
    if (c128.ok) {
      seen++;
      expect(draw('CODE128', c128.value)).toBe(c128.value);
    }
    const raw39 = chars(code39, 1 + (i % 80)).trim(); // the page trims, as a pasted line break would need
    if (!raw39) continue;
    for (const mod43 of [false, true]) {
      const c39 = checkBarcode('code39', raw39, { mod43 });
      if (!c39.ok) continue;
      seen++;
      // JsBarcode computes its own mod 43 character: it must be ours.
      expect(draw('CODE39', raw39.toUpperCase(), mod43)).toBe(c39.value);
      expect(draw('CODE39', c39.value)).toBe(c39.value);
    }
    const n10 = digits(9);
    const isbn = checkBarcode('isbn', `${n10}${(() => { let sum = 0; for (let k = 0; k < 9; k++) sum += Number(n10[k]) * (10 - k); const c = (11 - (sum % 11)) % 11; return c === 10 ? 'X' : String(c); })()}`);
    expect(isbn.ok).toBe(true);
    if (isbn.ok) expect(() => JsBarcode({}, isbn.value, { format: 'EAN13' })).not.toThrow();
  }
  expect(seen).toBeGreaterThan(900);
});
