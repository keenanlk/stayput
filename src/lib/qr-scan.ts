/**
 * What a scanned code holds, described for display. Pure functions: no DOM, no
 * network and no decoder import, so they run in plain unit tests. Decoded text
 * is attacker-controlled (anyone can print a code), so nothing here builds
 * markup: callers set it with textContent, and an address is only offered as a
 * button the visitor presses, after the checks below.
 */

export type CodeKind = 'link' | 'wifi' | 'contact' | 'email' | 'phone' | 'sms' | 'location' | 'event' | 'otp' | 'app' | 'address' | 'barcode' | 'matrix' | 'text';

export interface Field {
  label: string;
  value: string;
  /** Hidden behind a Show button. */
  secret?: boolean;
}

export interface CopyAction {
  label: string;
  value: string;
}

/** A link the visitor presses. Never followed by the page itself. */
export interface OpenAction {
  label: string;
  href: string;
}

export interface SaveAction {
  label: string;
  filename: string;
  mime: string;
  content: string;
}

export interface CodeDescription {
  kind: CodeKind;
  /** Card label, such as `Link` or `Barcode (EAN-13)`. */
  label: string;
  /** The decoded text, untouched. */
  text: string;
  fields: Field[];
  notes: string[];
  warnings: string[];
  /** Links only: the domain on its own line and the full address as text. */
  link?: { hostname: string; lead: string; strong: string; address: string };
  copies: CopyAction[];
  open?: OpenAction;
  save?: SaveAction;
  wifi?: { name: string; security: 'WPA' | 'WEP' | 'none'; password: string; hidden: boolean };
  /** Binary contents shown as hexadecimal instead of text. */
  hex?: string;
}

/** Fixed hint lists: a hint, not a verdict. */
const SHORTENERS = ['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 't.ly', 'tiny.cc', 'lnkd.in', 'qr.link'];
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);

export const LINK_NOTE =
  'This page has not opened the link. Read the domain letter by letter before you open it; look-alike sites swap one letter (rn for m, 0 for o, l for I).';

const FORMAT_LABELS: Record<string, string> = {
  QRCode: 'QR code', QRCodeModel1: 'QR code', QRCodeModel2: 'QR code', MicroQRCode: 'Micro QR code', RMQRCode: 'rMQR code',
  DataMatrix: 'Data Matrix', Aztec: 'Aztec code', AztecCode: 'Aztec code', AztecRune: 'Aztec rune', PDF417: 'PDF417', CompactPDF417: 'PDF417', MicroPDF417: 'MicroPDF417', MaxiCode: 'MaxiCode',
  EAN13: 'EAN-13', EAN8: 'EAN-8', EAN5: 'EAN-5', EAN2: 'EAN-2', EANUPC: 'EAN/UPC', ISBN: 'ISBN', UPCA: 'UPC-A', UPCE: 'UPC-E',
  Code128: 'Code 128', Code39: 'Code 39', Code39Std: 'Code 39', Code39Ext: 'Code 39', Code93: 'Code 93', Code32: 'Code 32', PZN: 'PZN', ITF: 'ITF', ITF14: 'ITF-14', Codabar: 'Codabar',
  DataBar: 'DataBar', DataBarOmni: 'DataBar', DataBarStk: 'DataBar', DataBarStkOmni: 'DataBar', DataBarLtd: 'DataBar Limited', DataBarExp: 'DataBar Expanded', DataBarExpStk: 'DataBar Expanded',
  Telepen: 'Telepen', TelepenAlpha: 'Telepen', TelepenNumeric: 'Telepen', DXFilmEdge: 'DX film edge', OtherBarcode: 'Barcode',
};
const LINEAR = new Set(['EAN13', 'EAN8', 'EAN5', 'EAN2', 'EANUPC', 'ISBN', 'UPCA', 'UPCE', 'Code128', 'Code39', 'Code39Std', 'Code39Ext', 'Code93', 'Code32', 'PZN', 'ITF', 'ITF14', 'Codabar', 'DataBar', 'DataBarOmni', 'DataBarStk', 'DataBarStkOmni', 'DataBarLtd', 'DataBarExp', 'DataBarExpStk', 'Telepen', 'TelepenAlpha', 'TelepenNumeric', 'DXFilmEdge', 'OtherBarcode']);

export const formatLabel = (format: string): string => FORMAT_LABELS[format] ?? format;

/** C0 and C1 controls, soft hyphen, zero-width and bidirectional formatting characters. */
const HIDDEN = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;
const hex4 = (c: string) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');

/** The text with every hidden character replaced by a visible escape such as ‹U+202E›. */
export function showHidden(text: string): string {
  return text.replace(HIDDEN, (c) => (c === '\n' || c === '\t' ? c : `‹${hex4(c)}›`));
}

export interface UrlDescription {
  url: URL;
  hostname: string;
  lead: string;
  strong: string;
  /** The full address as text, with hidden characters made visible. */
  address: string;
  warnings: string[];
}

/** The part of a hostname to emphasise: the last two labels, or three for `co.uk` style endings. */
export function emphasise(hostname: string): { lead: string; strong: string } {
  const labels = hostname.split('.');
  if (labels.length <= 2 || /^\d+(\.\d+){3}$/.test(hostname) || hostname.startsWith('[')) return { lead: '', strong: hostname };
  const last = labels[labels.length - 1]!;
  const second = labels[labels.length - 2]!;
  const take = SECOND_LEVEL.has(second) && /^[a-z]{2}$/i.test(last) && labels.length > 2 ? 3 : 2;
  const split = labels.length - take;
  return { lead: labels.slice(0, split).join('.') + '.', strong: labels.slice(split).join('.') };
}

/** Parse an http or https address and work out the local warnings. Null when it is not one. */
export function describeUrl(text: string): UrlDescription | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const hostname = url.hostname;
  const labels = hostname.split('.');
  const warnings: string[] = [];
  // 1. letters from outside the English alphabet (the parser writes them as xn-- labels)
  // eslint-disable-next-line no-control-regex
  if (labels.some((l) => l.toLowerCase().startsWith('xn--')) || /[^\u0000-\u007F]/.test(hostname)) {
    warnings.push(`The domain uses letters from outside the English alphabet (written as ${hostname}). Look-alike letters from other alphabets are a common trick. Check it is the site you expect.`);
  }
  // 2. a name before an @ sign
  if (url.username || url.password) {
    warnings.push(`The address has a name before an @ sign. The browser ignores it and goes to ${hostname}, which may not be the name you noticed first.`);
  }
  // 3. a number instead of a name
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[');
  if (isIp) warnings.push('The address is a number, not a name, so you cannot tell whose site it is.');
  // 4. a shortener
  const bare = hostname.replace(/^www\./, '');
  if (SHORTENERS.includes(bare)) warnings.push(`${hostname} is a link shortener, so the real destination is hidden until you open it.`);
  // 5. not encrypted
  if (url.protocol === 'http:') warnings.push('This link is not encrypted (http, not https). Anything you type there can be read on the way.');
  // 6. an unusual port
  if (url.port && url.port !== '80' && url.port !== '443') warnings.push(`The address uses port ${url.port}, which ordinary sites rarely show.`);
  // 7. many labels
  if (!isIp && labels.length >= 5) {
    warnings.push(`The address has many parts before the main domain (${hostname}). Scams often put a trusted name at the front; the part that counts is the end.`);
  }
  // 8. another address inside this one
  if (/https?(?::|%3a)(?:\/|%2f){2}/i.test(url.search + url.hash)) {
    warnings.push('The address contains another address, so it may pass you on to a different site.');
  }
  // 9. hidden control or direction characters
  const hidden = [...new Set(text.match(HIDDEN) ?? [])].filter((c) => c !== '\n' && c !== '\t');
  if (hidden.length > 0) {
    warnings.push(`The text holds hidden control or direction characters (shown as ${hidden.map((c) => `‹${hex4(c)}›`).join(' ')}). They can make an address read differently from what it is.`);
  }
  return { url, hostname, ...emphasise(hostname), address: showHidden(text.trim()), warnings };
}

/** Whether a decoded string would be a link the page may offer to open. */
export const isWebLink = (text: string): boolean => describeUrl(text) !== null;

// ---------- Wi-Fi, vCard, MECARD ----------

/** Split `KEY:value;KEY:value;;` into pairs, honouring backslash escapes. */
function splitPairs(body: string): [string, string][] {
  const out: [string, string][] = [];
  let key = '';
  let value = '';
  let inKey = true;
  let quoted = false;
  const flush = () => {
    if (key || value) out.push([key.toUpperCase(), value]);
    key = value = '';
    inKey = true;
    quoted = false;
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === '\\' && i + 1 < body.length) {
      (inKey ? (key += body[++i]) : (value += body[++i]));
    } else if (c === '"' && !inKey && (quoted || value === '')) {
      quoted = !quoted;
    } else if (c === ';' && !quoted) {
      flush();
    } else if (c === ':' && inKey) {
      inKey = false;
    } else if (inKey) {
      key += c;
    } else {
      value += c;
    }
  }
  flush();
  return out;
}

export function parseWifi(text: string): { name: string; security: 'WPA' | 'WEP' | 'none'; password: string; hidden: boolean } {
  const pairs = splitPairs(text.replace(/^wifi:/i, ''));
  const get = (k: string) => pairs.find(([key]) => key === k)?.[1] ?? '';
  const t = get('T').toUpperCase();
  const security = t === 'WEP' ? 'WEP' : t === '' || t === 'NOPASS' ? 'none' : 'WPA';
  return { name: get('S'), security, password: get('P'), hidden: /^(true|1|yes)$/i.test(get('H')) };
}

const unescapeVcard = (v: string) => v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

export interface Contact {
  name: string;
  org: string;
  title: string;
  phones: string[];
  emails: string[];
  urls: string[];
  address: string;
  note: string;
}

const emptyContact = (): Contact => ({ name: '', org: '', title: '', phones: [], emails: [], urls: [], address: '', note: '' });

export function parseVcard(text: string): Contact {
  const c = emptyContact();
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  let structured = '';
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const prop = line.slice(0, colon).split(';')[0]!.toUpperCase().replace(/^[A-Z0-9-]+\./, '');
    const value = line.slice(colon + 1);
    if (prop === 'FN') c.name = unescapeVcard(value).trim();
    else if (prop === 'N') {
      const [family = '', given = '', additional = '', prefix = '', suffix = ''] = value.split(';').map((p) => unescapeVcard(p).trim());
      structured = [prefix, given, additional, family, suffix].filter(Boolean).join(' ');
    } else if (prop === 'ORG') c.org = value.split(';').map((p) => unescapeVcard(p).trim()).filter(Boolean).join(', ');
    else if (prop === 'TITLE') c.title = unescapeVcard(value).trim();
    else if (prop === 'TEL') c.phones.push(unescapeVcard(value).trim());
    else if (prop === 'EMAIL') c.emails.push(unescapeVcard(value).trim());
    else if (prop === 'URL') c.urls.push(unescapeVcard(value).trim());
    else if (prop === 'ADR') c.address = value.split(';').map((p) => unescapeVcard(p).trim()).filter(Boolean).join(', ');
    else if (prop === 'NOTE') c.note = unescapeVcard(value).trim();
  }
  c.name ||= structured;
  return c;
}

export function parseMecard(text: string): Contact {
  const c = emptyContact();
  for (const [key, value] of splitPairs(text.replace(/^mecard:/i, ''))) {
    if (key === 'N') {
      const [family = '', given = ''] = value.split(',');
      c.name = [given, family].map((s) => s.trim()).filter(Boolean).join(' ');
    } else if (key === 'ORG') c.org = value;
    else if (key === 'TEL') c.phones.push(value);
    else if (key === 'EMAIL') c.emails.push(value);
    else if (key === 'URL') c.urls.push(value);
    else if (key === 'ADR') c.address = value.split(',').map((s) => s.trim()).filter(Boolean).join(', ');
    else if (key === 'NOTE') c.note = value;
  }
  return c;
}

const vcardEscape = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** A minimal vCard 3.0 for a MECARD. */
export function mecardToVcard(c: Contact): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const parts = c.name.split(' ');
  lines.push(`N:${vcardEscape(parts.slice(-1)[0] ?? '')};${vcardEscape(parts.slice(0, -1).join(' '))};;;`);
  lines.push(`FN:${vcardEscape(c.name)}`);
  if (c.org) lines.push(`ORG:${vcardEscape(c.org)}`);
  if (c.title) lines.push(`TITLE:${vcardEscape(c.title)}`);
  for (const p of c.phones) lines.push(`TEL:${vcardEscape(p)}`);
  for (const e of c.emails) lines.push(`EMAIL:${vcardEscape(e)}`);
  for (const u of c.urls) lines.push(`URL:${u.replace(/[\r\n]/g, '')}`);
  if (c.address) lines.push(`ADR:;;${vcardEscape(c.address)};;;;`);
  if (c.note) lines.push(`NOTE:${vcardEscape(c.note)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

// ---------- mail, phone, text message, location ----------

/** Percent-decoding; `+` means a space only in query strings (`form`). */
function safeDecode(s: string, form = true): string {
  try {
    return decodeURIComponent(form ? s.replace(/\+/g, '%20') : s);
  } catch {
    return s;
  }
}

function queryOf(rest: string): { head: string; params: Record<string, string> } {
  const q = rest.indexOf('?');
  const head = q < 0 ? rest : rest.slice(0, q);
  const params: Record<string, string> = {};
  if (q >= 0) {
    for (const part of rest.slice(q + 1).split('&')) {
      const eq = part.indexOf('=');
      const k = safeDecode(eq < 0 ? part : part.slice(0, eq)).toLowerCase();
      params[k] = safeDecode(eq < 0 ? '' : part.slice(eq + 1));
    }
  }
  return { head, params };
}

export function parseMailto(text: string): { to: string; subject: string; body: string } {
  if (/^matmsg:/i.test(text)) {
    const pairs = splitPairs(text.replace(/^matmsg:/i, ''));
    const get = (k: string) => pairs.find(([key]) => key === k)?.[1] ?? '';
    return { to: get('TO'), subject: get('SUB'), body: get('BODY') };
  }
  const { head, params } = queryOf(text.replace(/^mailto:/i, ''));
  return { to: safeDecode(head, false).trim(), subject: params.subject ?? '', body: params.body ?? '' };
}

const keep = (s: string, allowed: RegExp) => s.replace(allowed, '');

function parseSms(text: string): { number: string; message: string } {
  const rest = text.replace(/^(smsto|sms|mms|mmsto):/i, '');
  const { head, params } = queryOf(rest);
  if (params.body !== undefined) return { number: safeDecode(head, false).trim(), message: params.body };
  const colon = head.indexOf(':');
  return colon < 0 ? { number: safeDecode(head, false).trim(), message: '' } : { number: head.slice(0, colon).trim(), message: head.slice(colon + 1) };
}

function parseGeo(text: string): { lat: number; lon: number } | null {
  const m = /^geo:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

function parseOtp(text: string): { issuer: string; account: string; secret: string } {
  let issuer = '';
  let account = '';
  let secret = '';
  try {
    const u = new URL(text);
    const label = safeDecode(u.pathname.replace(/^\/+/, ''));
    const colon = label.indexOf(':');
    issuer = u.searchParams.get('issuer') ?? (colon >= 0 ? label.slice(0, colon).trim() : '');
    account = (colon >= 0 ? label.slice(colon + 1) : label).trim();
    secret = u.searchParams.get('secret') ?? '';
  } catch {
    // Show what can be shown: the page still says what kind of code this is.
  }
  return { issuer, account, secret };
}

// ---------- describing a code ----------

const blank = (kind: CodeKind, label: string, text: string): CodeDescription => ({ kind, label, text, fields: [], notes: [], warnings: [], copies: [] });
const add = (d: CodeDescription, label: string, value: string, secret = false) => {
  if (value) d.fields.push({ label, value, ...(secret ? { secret } : {}) });
};

const KNOWN_APP_SCHEMES = /^(upi|bitcoin|litecoin|ethereum|intent|market|whatsapp|tg|skype|zoommtg|facetime|viber|weixin|alipays?|paypal|spotify|itms-apps?|fb|twitter|instagram|snssdk\d*|line|mailchimp|webcal|ssh|ftp|sftp|smb|rtsp|magnet):/i;

export interface DescribeOptions {
  /** The raw bytes, used to show binary contents as hexadecimal. */
  bytes?: Uint8Array;
  /** ZXing's content type. */
  contentType?: string;
}

const hexOf = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');

export function describeCode(text: string, format = 'QRCode', opts: DescribeOptions = {}): CodeDescription {
  const linear = LINEAR.has(format);
  const fmt = formatLabel(format);

  // Binary contents
  if ((opts.contentType === 'Binary' || text.includes('\uFFFD')) && !describeUrl(text)) {
    const d = blank('matrix', fmt, text);
    d.notes.push('This code holds binary data. Shown as hexadecimal:');
    d.hex = opts.bytes ? hexOf(opts.bytes) : [...new TextEncoder().encode(text)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    d.copies.push({ label: 'Copy', value: d.hex });
    return d;
  }

  if (/^wifi:/i.test(text)) {
    const w = parseWifi(text);
    const d = blank('wifi', 'Wi-Fi network', text);
    d.wifi = w;
    add(d, 'Network name', w.name);
    add(d, 'Security', w.security === 'WEP' ? 'WEP' : w.security === 'none' ? 'None' : 'WPA/WPA2/WPA3');
    add(d, 'Password', w.password, true);
    add(d, 'Hidden network', w.hidden ? 'Yes' : 'No');
    d.notes.push('A web page cannot join the network for you. Copy the password and enter it in your Wi-Fi settings, or scan the code with your phone’s camera app, which can usually join directly.');
    d.copies.push({ label: 'Copy network name', value: w.name });
    if (w.password) d.copies.push({ label: 'Copy password', value: w.password });
    return d;
  }

  if (/^begin:vcard/i.test(text) || /^mecard:/i.test(text)) {
    const isMecard = /^mecard:/i.test(text);
    const c = isMecard ? parseMecard(text) : parseVcard(text);
    const d = blank('contact', 'Contact', text);
    add(d, 'Name', c.name);
    add(d, 'Organisation', c.org);
    add(d, 'Job title', c.title);
    for (const p of c.phones) add(d, 'Phone', p);
    for (const e of c.emails) add(d, 'Email', e);
    for (const u of c.urls) add(d, 'Web address', u);
    add(d, 'Address', c.address);
    add(d, 'Note', c.note);
    d.copies.push({ label: 'Copy', value: text });
    d.save = { label: 'Save contact (.vcf)', filename: 'contact.vcf', mime: 'text/vcard', content: isMecard ? mecardToVcard(c) : text };
    return d;
  }

  if (/^(mailto:|matmsg:)/i.test(text)) {
    const m = parseMailto(text);
    const d = blank('email', 'Email', text);
    add(d, 'To', m.to);
    add(d, 'Subject', m.subject);
    add(d, 'Message', m.body);
    d.copies.push({ label: 'Copy address', value: m.to });
    const q = [m.subject ? `subject=${encodeURIComponent(m.subject)}` : '', m.body ? `body=${encodeURIComponent(m.body)}` : ''].filter(Boolean).join('&');
    if (m.to && !/[\s\u0000-\u001F]/.test(m.to)) d.open = { label: 'Open in email app', href: `mailto:${encodeURIComponent(m.to).replace(/%40/g, '@').replace(/%2C/g, ',')}${q ? `?${q}` : ''}` };
    return d;
  }

  if (/^tel:/i.test(text)) {
    const number = safeDecode(text.replace(/^tel:/i, ''), false).trim();
    const d = blank('phone', 'Phone number', text);
    add(d, 'Number', number);
    d.copies.push({ label: 'Copy number', value: number });
    const dial = keep(number, /[^\d+*#,;]/g);
    if (dial) d.open = { label: 'Call', href: `tel:${dial}` };
    return d;
  }

  if (/^(smsto|sms|mmsto|mms):/i.test(text)) {
    const s = parseSms(text);
    const d = blank('sms', 'Text message', text);
    add(d, 'Number', s.number);
    add(d, 'Message', s.message);
    d.copies.push({ label: 'Copy number', value: s.number }, { label: 'Copy message', value: s.message });
    return d;
  }

  if (/^geo:/i.test(text)) {
    const g = parseGeo(text);
    if (g) {
      const d = blank('location', 'Location', text);
      add(d, 'Latitude', String(g.lat));
      add(d, 'Longitude', String(g.lon));
      d.copies.push({ label: 'Copy coordinates', value: `${g.lat}, ${g.lon}` });
      d.open = {
        label: 'Show on map',
        href: `https://www.openstreetmap.org/?mlat=${g.lat.toFixed(6)}&mlon=${g.lon.toFixed(6)}#map=17/${g.lat.toFixed(6)}/${g.lon.toFixed(6)}`,
      };
      return d;
    }
  }

  if (/^begin:(vevent|vcalendar)/i.test(text)) {
    const d = blank('event', 'Calendar event', text);
    d.notes.push(text);
    d.copies.push({ label: 'Copy text', value: text });
    const wrapped = /^begin:vcalendar/i.test(text) ? text : `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${text.replace(/\r?\n/g, '\r\n')}\r\nEND:VCALENDAR\r\n`;
    d.save = { label: 'Save event (.ics)', filename: 'event.ics', mime: 'text/calendar', content: wrapped };
    return d;
  }

  if (/^otpauth(-migration)?:/i.test(text)) {
    const o = parseOtp(text);
    const d = blank('otp', 'Two-factor setup key', text);
    d.notes.push('This code holds a key that makes login codes for an account. Anyone who has it can make those codes. Do not share it.');
    add(d, 'Issuer', o.issuer);
    add(d, 'Account', o.account);
    add(d, 'Key', o.secret || 'Included in the code', !!o.secret);
    d.copies.push({ label: 'Copy', value: text });
    return d;
  }

  const link = describeUrl(text);
  if (link) {
    const d = blank('link', 'Link', text);
    d.link = { hostname: link.hostname, lead: link.lead, strong: link.strong, address: link.address };
    d.warnings = link.warnings;
    d.notes.push(LINK_NOTE);
    d.copies.push({ label: 'Copy link', value: text.trim() });
    d.open = { label: 'Open link', href: link.url.href };
    return d;
  }

  // Any other scheme is an app link or a script: displayed, never opened.
  if (/^[a-z][a-z0-9+.-]{1,31}:(?!\s|\d+(?:\/|$))/i.test(text) && !/[\r\n]/.test(text) && (KNOWN_APP_SCHEMES.test(text) || /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || !/\s/.test(text))) {
    const d = blank('app', 'Link for another app', text);
    d.notes.push('This code opens another app, not a web page, so this page will not open it. Check what it is before you use it in that app.');
    d.copies.push({ label: 'Copy', value: text });
    return d;
  }

  if (!linear && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(text.trim())) {
    const d = blank('address', 'Text', text);
    d.notes.push('This looks like a web address without https://.');
    d.copies.push({ label: 'Copy', value: text });
    const parsed = describeUrl(`https://${text.trim()}`);
    if (parsed) {
      d.open = { label: 'Open as https://…', href: parsed.url.href };
      d.warnings = parsed.warnings;
    }
    return d;
  }

  if (linear) {
    const d = blank('barcode', `Barcode (${fmt})`, text);
    d.notes.push('A barcode like this holds a number that identifies a product or item. It holds no link, and this page does not look the number up.');
    if (/^97[89]\d{10}$/.test(text)) d.notes.push('This is an ISBN (a book).');
    d.copies.push({ label: 'Copy number', value: text });
    return d;
  }

  if (/^(QRCode|QRCodeModel1|QRCodeModel2|MicroQRCode|RMQRCode)$/.test(format)) {
    const d = blank('text', 'Text', text);
    d.copies.push({ label: 'Copy text', value: text });
    return d;
  }

  const d = blank('matrix', fmt, text);
  d.copies.push({ label: 'Copy', value: text });
  return d;
}

// ---------- results ----------

export interface Hit {
  text: string;
  format: string;
  isValid: boolean;
  bytes?: Uint8Array;
  contentType?: string;
  position?: { topLeft: { x: number; y: number } };
}

/** Reading order: rows of 5% of the image height from the top, then left to right. */
export function sortReadingOrder<T extends { position?: { topLeft: { x: number; y: number } } }>(results: T[], imageHeight = 1000): T[] {
  const row = Math.max(1, imageHeight * 0.05);
  const key = (r: T) => ({ y: Math.floor((r.position?.topLeft.y ?? 0) / row), x: r.position?.topLeft.x ?? 0 });
  return results
    .map((r, i) => ({ r, i, ...key(r) }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.i - b.i)
    .map((e) => e.r);
}

/** Valid hits only, in reading order; identical text is kept once with a count. */
export function collectCodes<T extends Hit>(hits: T[], imageHeight = 1000, cap = 8): { codes: { hit: T; count: number }[]; capped: boolean } {
  const valid = sortReadingOrder(
    hits.filter((h) => h.isValid),
    imageHeight,
  );
  const codes: { hit: T; count: number }[] = [];
  for (const hit of valid) {
    const same = codes.find((c) => c.hit.text === hit.text);
    if (same) same.count++;
    else codes.push({ hit, count: 1 });
  }
  return { codes: codes.slice(0, cap), capped: codes.length > cap };
}

// ---------- messages ----------

export const MESSAGES = {
  noCode: 'No QR code or barcode was found in this image.',
  noCodeTips: [
    'Make sure the whole code is in the picture, with a blank border around it.',
    'Crop closer and use a sharper, brighter picture.',
    'If the code is on a screen, take a screenshot instead of a photo of the screen.',
    'Some apps use their own round or dotted codes. Those are not standard QR codes and can only be read inside that app.',
  ],
  damaged: 'A code was found, but it could not be read cleanly. It may be blurred, scratched or partly covered. Try a sharper picture, or take another photo from straight on with more light.',
  notImage: 'This file could not be opened as an image. It may be damaged, or in a format this browser cannot show. Try a screenshot, or save it as a JPG or PNG and drop that.',
  pdf: 'This is a PDF, not an image. Take a screenshot of the page with the code, or save the page as an image, and drop that.',
  tooLarge: 'This image is too large for this device to open. Reduce it first, for example with the image compressor, and try again.',
  decoderFailed: 'The reading code could not be loaded. Check your connection and try again.',
} as const;

// ---------- camera ----------

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
}

export type CameraState = 'idle' | 'asking' | 'live' | 'no-api' | 'insecure' | 'denied' | 'dismissed' | 'no-camera' | 'in-use' | 'blocked' | 'ended' | 'other';

export interface CameraFailure {
  state: CameraState;
  /** First line, then any numbered steps and closing lines. */
  lines: string[];
}

export const CAMERA_COPY = {
  idleHeading: 'Scan with your camera',
  idle: 'Your browser asks to use the camera when you press the button. The picture stays in this tab and is not uploaded.',
  asking: 'Waiting for you to allow the camera…',
  live: 'Hold the code inside the picture. It is read in this tab; nothing is uploaded.',
  stillLooking: 'Still looking. Move a little closer, tilt the code to avoid glare, or add light. If the code is on another screen, a screenshot works better: press Stop and paste it.',
  hidden: 'The camera was turned off because you left this tab. Press Scan with camera to use it again.',
  ended: 'The camera stopped. Press Scan with camera to start it again.',
  noApi: 'This browser cannot use a camera in web pages. If you opened this page from inside another app, open it in Safari or Chrome instead. You can still drop, paste or choose an image above.',
  insecure: 'The camera works only on secure pages (https), and this page was not opened that way, so the browser has switched the camera off. Open stayput.dev/tools/qr-code-scanner directly, or use an image above.',
  other: 'The camera could not start. Choose or paste an image above instead.',
} as const;

/** The state and message for a getUserMedia failure. Never includes the error's own message. */
export function cameraFailure(errorName: string, env: { platform: Platform; dismissed?: boolean } = { platform: 'desktop' }): CameraFailure {
  switch (errorName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      if (env.dismissed) {
        return { state: 'dismissed', lines: ['The camera was not allowed this time. Press Scan with camera and choose Allow when your browser asks.'] };
      }
      if (env.platform === 'ios') {
        return {
          state: 'denied',
          lines: [
            'The camera is switched off for this page.',
            '1. Tap the aA button at the left of the address bar.',
            '2. Tap Website Settings.',
            '3. Tap Camera, then Allow.',
            '4. Reload the page and press Scan with camera again.',
            'If Camera is already set to Allow here, open Settings > Apps > Safari > Camera and choose Ask or Allow. On iOS 17 and earlier it is Settings > Safari > Camera.',
          ],
        };
      }
      if (env.platform === 'android') {
        return {
          state: 'denied',
          lines: [
            'The camera is blocked for this page.',
            '1. Tap the icon at the left of the address bar (a lock or a settings icon).',
            '2. Tap Permissions, then Camera, and choose Allow.',
            '3. Reload the page and press Scan with camera again.',
            'If it still fails, open Chrome’s menu (three dots) > Settings > Site settings > Camera and check this site is not under Blocked. Then check Android’s own setting: Settings > Apps > Chrome > Permissions > Camera.',
          ],
        };
      }
      return {
        state: 'denied',
        lines: ['The camera is blocked for this page. Click the camera or lock icon at the left of the address bar, set Camera to Allow, and reload. Your system’s privacy settings can also block the browser from using the camera.'],
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { state: 'no-camera', lines: ['No camera was found on this device. Plug one in, or drop, paste or choose an image above.'] };
    case 'NotReadableError':
    case 'AbortError':
    case 'TrackStartError':
      return { state: 'in-use', lines: ['The camera is in use by another app or tab, or something is covering it. Close the other app (video calls are the usual cause) and press Scan with camera again.'] };
    case 'SecurityError':
      return { state: 'blocked', lines: ['This page is not allowed to use the camera here. If it is shown inside another site, open it in its own tab.'] };
    default:
      return { state: 'other', lines: [CAMERA_COPY.other] };
  }
}
