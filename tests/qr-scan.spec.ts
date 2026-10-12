import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  cameraFailure,
  collectCodes,
  describeCode,
  describeUrl,
  detectPlatform,
  emphasise,
  parseMecard,
  parseVcard,
  parseWifi,
  sortReadingOrder,
} from '../src/lib/qr-scan';

// Pure tests: no browser. They pin the exact wording the scanner page shows.

const texts = JSON.parse(readFileSync(new URL('./fixtures/qr/texts.json', import.meta.url), 'utf8')) as Record<string, string>;

test('link warnings use the exact copy, one case each', () => {
  const w = (u: string) => describeUrl(u)!.warnings;
  expect(w('https://xn--pple-43d.com/')).toEqual([
    'The domain uses letters from outside the English alphabet (written as xn--pple-43d.com). Look-alike letters from other alphabets are a common trick. Check it is the site you expect.',
  ]);
  expect(w('https://paypal.com@evil.example/')).toEqual([
    'The address has a name before an @ sign. The browser ignores it and goes to evil.example, which may not be the name you noticed first.',
  ]);
  expect(w('http://192.168.0.1/login')).toEqual([
    'The address is a number, not a name, so you cannot tell whose site it is.',
    'This link is not encrypted (http, not https). Anything you type there can be read on the way.',
  ]);
  expect(w('https://bit.ly/abc')).toEqual(['bit.ly is a link shortener, so the real destination is hidden until you open it.']);
  expect(w('https://example.com:8443/')).toEqual(['The address uses port 8443, which ordinary sites rarely show.']);
  expect(w('https://a.b.c.d.example.com/')).toEqual([
    'The address has many parts before the main domain (a.b.c.d.example.com). Scams often put a trusted name at the front; the part that counts is the end.',
  ]);
  expect(w('https://example.com/?next=https://other.example')).toEqual(['The address contains another address, so it may pass you on to a different site.']);
  expect(w('https://example.com/?next=https%3A%2F%2Fother.example')).toHaveLength(1);
  expect(w('https://example.com/report‮gpj.exe')).toEqual([
    'The text holds hidden control or direction characters (shown as ‹U+202E›). They can make an address read differently from what it is.',
  ]);
  // A link with no warnings is shown with none, and is never labelled safe.
  const clean = describeCode('https://stayput.dev/tools/qr-code-scanner');
  expect(clean.kind).toBe('link');
  expect(clean.warnings).toEqual([]);
  expect(JSON.stringify(clean).toLowerCase()).not.toMatch(/\bsafe\b.*\btrue\b|"safe"/);
});

test('hidden characters are shown as visible escapes in the address block', () => {
  const d = describeCode('https://example.com/a‮b​c');
  expect(d.link!.address).toBe('https://example.com/a‹U+202E›b‹U+200B›c');
  // The open link is the parsed address, not the raw text.
  expect(d.open!.href).not.toContain('‮');
});

test('the emphasised end of a domain', () => {
  expect(emphasise('a.b.example.com')).toEqual({ lead: 'a.b.', strong: 'example.com' });
  expect(emphasise('www.bbc.co.uk')).toEqual({ lead: 'www.', strong: 'bbc.co.uk' });
  expect(emphasise('shop.example.com.au')).toEqual({ lead: 'shop.', strong: 'example.com.au' });
  expect(emphasise('stayput.dev')).toEqual({ lead: '', strong: 'stayput.dev' });
  expect(describeCode(texts.url!).link).toMatchObject({ hostname: 'stayput.dev', strong: 'stayput.dev', address: texts.url });
});

test('Wi-Fi codes', () => {
  const w = parseWifi(texts.wifi!);
  expect(w).toEqual({ name: 'Cafe Guest', security: 'WPA', password: 'correct-horse-battery', hidden: false });
  expect(parseWifi('WIFI:S:a\\;b;P:c\\:d;;')).toMatchObject({ name: 'a;b', password: 'c:d' });
  expect(parseWifi('WIFI:T:nopass;S:Open;;').security).toBe('none');
  expect(parseWifi('WIFI:T:WEP;S:Old;P:12345;;').security).toBe('WEP');
  expect(parseWifi('WIFI:T:WPA;S:Hidden;P:x;H:true;;').hidden).toBe(true);
  const d = describeCode(texts.wifi!);
  expect(d.kind).toBe('wifi');
  expect(d.label).toBe('Wi-Fi network');
  expect(d.fields.find((f) => f.label === 'Password')).toEqual({ label: 'Password', value: 'correct-horse-battery', secret: true });
  expect(d.copies.map((c) => c.label)).toEqual(['Copy network name', 'Copy password']);
  expect(d.open).toBeUndefined();
});

test('mail, phone, text message, location, calendar and contacts', () => {
  const mail = describeCode('mailto:hello@example.com?subject=Hi');
  expect(mail).toMatchObject({ kind: 'email', label: 'Email' });
  expect(mail.fields).toEqual([
    { label: 'To', value: 'hello@example.com' },
    { label: 'Subject', value: 'Hi' },
  ]);
  expect(mail.open).toEqual({ label: 'Open in email app', href: 'mailto:hello@example.com?subject=Hi' });
  expect(describeCode('MATMSG:TO:a@example.com;SUB:Hello;BODY:Text;;').fields.map((f) => f.value)).toEqual(['a@example.com', 'Hello', 'Text']);

  const tel = describeCode('tel:+15551234567');
  expect(tel).toMatchObject({ kind: 'phone', label: 'Phone number' });
  expect(tel.open).toEqual({ label: 'Call', href: 'tel:+15551234567' });

  expect(describeCode('smsto:+15551234567:Running late')).toMatchObject({ kind: 'sms', fields: [{ label: 'Number', value: '+15551234567' }, { label: 'Message', value: 'Running late' }] });

  const geo = describeCode('geo:40.446111,-79.982222');
  expect(geo.kind).toBe('location');
  expect(geo.open!.href).toMatch(/^https:\/\/www\.openstreetmap\.org\/\?mlat=40\.446111&mlon=-79\.982222/);

  const ics = describeCode('BEGIN:VEVENT\nSUMMARY:Lunch\nEND:VEVENT');
  expect(ics.kind).toBe('event');
  expect(ics.save!.content).toContain('BEGIN:VCALENDAR');

  const v = parseVcard(texts.vcard!);
  expect(v).toMatchObject({ name: 'Jane Doe', org: 'Example Co', phones: ['+15551234567'], emails: ['jane@example.com'], urls: ['https://example.com'] });
  const card = describeCode(texts.vcard!);
  expect(card.kind).toBe('contact');
  expect(card.save!.content).toBe(texts.vcard);
  expect(parseMecard('MECARD:N:Doe,John;TEL:123;;')).toMatchObject({ name: 'John Doe', phones: ['123'] });
  const me = describeCode('MECARD:N:Doe,John;TEL:123;;');
  expect(me.kind).toBe('contact');
  expect(me.save!.content).toContain('BEGIN:VCARD');
  expect(me.save!.content).toContain('FN:John Doe');
});

test('a two-factor setup key hides its secret', () => {
  const d = describeCode('otpauth://totp/Example:me@example.com?secret=ABC234&issuer=Example');
  expect(d.kind).toBe('otp');
  expect(d.label).toBe('Two-factor setup key');
  expect(d.fields.filter((f) => !f.secret).map((f) => f.value)).toEqual(['Example', 'me@example.com']);
  const key = d.fields.find((f) => f.secret);
  expect(key!.value).toBe('ABC234');
  expect(d.fields.filter((f) => !f.secret).every((f) => !f.value.includes('ABC234'))).toBe(true);
  expect(d.notes.join(' ')).toContain('Do not share it.');
});

test('other schemes are shown as text and never get an open button', () => {
  for (const text of ['bitcoin:1abc?amount=1', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'upi://pay?pa=a@b&pn=Some Name']) {
    const d = describeCode(text);
    expect(d.kind, text).toBe('app');
    expect(d.label).toBe('Link for another app');
    expect(d.open, text).toBeUndefined();
    expect(d.link, text).toBeUndefined();
    expect(d.text).toBe(text);
  }
});

test('a web address without a scheme, and plain text', () => {
  const d = describeCode('example.com/page');
  expect(d).toMatchObject({ kind: 'address', label: 'Text' });
  expect(d.notes).toEqual(['This looks like a web address without https://.']);
  expect(d.open).toEqual({ label: 'Open as https://…', href: 'https://example.com/page' });
  const plain = describeCode('Meet at 5 pm: bring snacks');
  expect(plain).toMatchObject({ kind: 'text', label: 'Text' });
  expect(plain.open).toBeUndefined();
});

test('barcodes are labelled by format and hold a number, not a link', () => {
  const d = describeCode('5901234123457', 'EAN13');
  expect(d.kind).toBe('barcode');
  expect(d.label).toBe('Barcode (EAN-13)');
  expect(d.notes[0]).toBe('A barcode like this holds a number that identifies a product or item. It holds no link, and this page does not look the number up.');
  expect(d.open).toBeUndefined();
  expect(describeCode('9780306406157', 'EAN13').notes).toContain('This is an ISBN (a book).');
  expect(describeCode('ABC-123', 'Code128').label).toBe('Barcode (Code 128)');
  expect(describeCode('hello', 'DataMatrix')).toMatchObject({ kind: 'matrix', label: 'Data Matrix' });
  const bin = describeCode('��', 'DataMatrix', { bytes: new Uint8Array([0xff, 0x00, 0x10]), contentType: 'Binary' });
  expect(bin.hex).toBe('ff 00 10');
});

test('reading order, cap and repeats', () => {
  const at = (text: string, x: number, y: number) => ({ text, format: 'QRCode', isValid: true, position: { topLeft: { x, y } } });
  const sorted = sortReadingOrder([at('c', 1063, 143), at('a', 83, 143), at('b', 569, 139)], 1000);
  expect(sorted.map((r) => r.position.topLeft.x)).toEqual([83, 569, 1063]);
  const { codes, capped } = collectCodes([at('a', 10, 10), at('a', 300, 10), at('b', 600, 10), { ...at('junk', 5, 5), isValid: false }]);
  expect(codes.map((c) => [c.hit.text, c.count])).toEqual([['a', 2], ['b', 1]]);
  expect(capped).toBe(false);
  const many = Array.from({ length: 10 }, (_, i) => at(`code ${i}`, i * 100, 10));
  const nine = collectCodes(many, 1000, 8);
  expect(nine.codes).toHaveLength(8);
  expect(nine.capped).toBe(true);
});

test('invalid reads never become cards', () => {
  const { codes } = collectCodes([{ text: '(92)0462602451783112', format: 'RMQRCode', isValid: false }, { text: 'httpw;/.stcyput.deo/', format: 'QRCode', isValid: false }]);
  expect(codes).toEqual([]);
});

test('camera failures map to their states and copy', () => {
  expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')).toBe('ios');
  expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe('ios');
  expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)).toBe('desktop');
  expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36')).toBe('android');

  const ios = cameraFailure('NotAllowedError', { platform: 'ios' });
  expect(ios.state).toBe('denied');
  expect(ios.lines[0]).toBe('The camera is switched off for this page.');
  expect(ios.lines[1]).toBe('1. Tap the aA button at the left of the address bar.');
  const android = cameraFailure('NotAllowedError', { platform: 'android' });
  expect(android.lines[0]).toBe('The camera is blocked for this page.');
  expect(android.lines.join(' ')).toContain('Tap Permissions, then Camera, and choose Allow.');
  const desktop = cameraFailure('NotAllowedError', { platform: 'desktop' });
  expect(desktop.lines).toHaveLength(1);
  expect(desktop.lines[0]).toContain('Click the camera or lock icon at the left of the address bar');
  expect(cameraFailure('NotAllowedError', { platform: 'desktop', dismissed: true })).toMatchObject({ state: 'dismissed' });
  expect(cameraFailure('NotFoundError').state).toBe('no-camera');
  expect(cameraFailure('DevicesNotFoundError').lines[0]).toContain('No camera was found');
  for (const name of ['NotReadableError', 'AbortError', 'TrackStartError']) expect(cameraFailure(name).state, name).toBe('in-use');
  expect(cameraFailure('SecurityError').state).toBe('blocked');
  const other = cameraFailure('SomethingElse');
  expect(other).toEqual({ state: 'other', lines: ['The camera could not start. Choose or paste an image above instead.'] });
});

test('hostile text is returned untouched and never as HTML', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const d = describeCode(evil);
  expect(d.text).toBe(evil);
  expect(Object.keys(d).filter((k) => /html/i.test(k))).toEqual([]);
  expect(d.kind).toBe('text');
  const evilLink = describeCode('https://example.com/<script>alert(1)</script>');
  expect(evilLink.kind).toBe('link');
  expect(evilLink.link!.address).toContain('<script>');
  expect(describeUrl('not a link')).toBeNull();
});
