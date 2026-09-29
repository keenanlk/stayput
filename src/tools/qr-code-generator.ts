import { bool, createShell, num, radio, str } from '../lib/shell';
import { downloadBlob } from '../lib/files';
import { trackToolRun } from '../lib/analytics';
import { drawQr, emailPayload, encodeQr, qrSvg, vcardPayload, wifiPayload, type Ecc, type QrCode } from '../lib/qr';

/**
 * QR code generator. The code is built in this page from what is typed, so a
 * Wi-Fi password or a contact card never reaches a server, and the code holds
 * the text itself (a "static" code): it cannot expire or be redirected.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const frame = $('qr-frame');
const canvas = $<HTMLCanvasElement>('qr-canvas');
const info = $('qr-info');
const pngBtn = $<HTMLButtonElement>('qr-png');
const svgBtn = $<HTMLButtonElement>('qr-svg');

// The shell supplies the privacy panel and next steps; files are never added here.
createShell({ process: async () => [] });

let current: { qr: QrCode; payload: string; kind: string } | undefined;
let firstOk = true;

const kind = () => radio('qr-kind', 'text');

function payload(): string {
  switch (kind()) {
    case 'wifi': {
      const ssid = str('qr-ssid').trim();
      if (!ssid) return '';
      return wifiPayload({ ssid, password: str('qr-pass'), security: str('qr-security', 'WPA') as 'WPA' | 'WEP' | 'nopass', hidden: bool('qr-hidden') });
    }
    case 'contact': {
      const o = { first: str('qr-first').trim(), last: str('qr-last').trim(), phone: str('qr-tel').trim(), email: str('qr-mail').trim(), org: str('qr-org').trim(), title: str('qr-role').trim(), url: str('qr-site').trim() };
      return Object.values(o).some(Boolean) ? vcardPayload(o) : '';
    }
    case 'email': {
      const to = str('qr-to').trim();
      return to ? emailPayload({ to, subject: str('qr-subject').trim(), body: str('qr-body') }) : '';
    }
    case 'phone': {
      const n = str('qr-number').replace(/[^\d+*#]/g, '');
      return n ? `tel:${n}` : '';
    }
    default:
      return str('qr-text').trim();
  }
}

function colours() {
  return { dark: str('qr-dark', '#000000'), light: bool('qr-clear') ? null : str('qr-light', '#ffffff'), margin: num('qr-margin', 4) };
}

/** Relative luminance, to warn when the code is lighter than its background. */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function say(text: string, warn = false) {
  info.textContent = text;
  info.classList.toggle('is-warn', warn);
}

function update() {
  for (const el of document.querySelectorAll<HTMLElement>('.qr-fields')) el.classList.toggle('is-active', el.dataset.kind === kind());
  const text = payload();
  current = undefined;
  pngBtn.disabled = svgBtn.disabled = true;
  if (!text) {
    frame.dataset.state = 'empty';
    say('');
    return;
  }
  let qr: QrCode;
  try {
    qr = encodeQr(text, str('qr-ecc', 'M') as Ecc);
  } catch (e) {
    frame.dataset.state = 'empty';
    say(e instanceof Error ? e.message : String(e), true);
    return;
  }
  current = { qr, payload: text, kind: kind() };
  const c = colours();
  drawQr(canvas, qr, { px: 512, ...c });
  frame.dataset.state = 'ready';
  frame.dataset.version = String(qr.version);
  pngBtn.disabled = svgBtn.disabled = false;
  const bytes = new TextEncoder().encode(text).length;
  const notes = [`${qr.size} × ${qr.size} squares (version ${qr.version}), ${bytes} ${bytes === 1 ? 'character' : 'characters'}`];
  let warn = false;
  if (c.light && luminance(c.dark) > luminance(c.light)) {
    notes.push('The code is lighter than its background, and many phone cameras cannot read inverted codes. Swap the colours.');
    warn = true;
  } else if (c.light && (luminance(c.light) + 0.05) / (luminance(c.dark) + 0.05) < 3) {
    notes.push('The colours are close; keep strong contrast so cameras can read it.');
    warn = true;
  } else if (qr.version > 10) {
    notes.push('A long text makes a dense code; print it larger or shorten the link.');
  }
  say(notes.join('. ') + (notes.length > 1 ? '' : '.'), warn);
}

function baseName(): string {
  if (!current) return 'qr-code';
  const text = current.payload;
  if (current.kind === 'wifi') return 'wifi-qr-code';
  if (current.kind === 'contact') return 'contact-qr-code';
  if (current.kind === 'email') return 'email-qr-code';
  if (current.kind === 'phone') return 'phone-qr-code';
  // A link names the file after its site: example-com-qr-code.
  const host = /^https?:\/\/([^/?#]+)/i.exec(text)?.[1]?.replace(/^www\./, '');
  return host ? `${host.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr-code` : 'qr-code';
}

function done(blob: Blob, format: string, started: number) {
  trackToolRun({ tool: root.dataset.slug ?? 'qr-code-generator', outcome: 'ok', firstOk, files: 0, inputBytes: 0, outputBytes: blob.size, ms: performance.now() - started, format: `${current?.kind ?? 'text'}-${format}` });
  firstOk = false;
  root.dispatchEvent(new CustomEvent('stayput:done'));
}

pngBtn.addEventListener('click', () => {
  if (!current) return;
  const started = performance.now();
  const out = document.createElement('canvas');
  drawQr(out, current.qr, { px: num('qr-px', 1024), ...colours() });
  out.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `${baseName()}.png`);
    done(blob, 'png', started);
  }, 'image/png');
});

svgBtn.addEventListener('click', () => {
  if (!current) return;
  const started = performance.now();
  const blob = new Blob([qrSvg(current.qr, colours())], { type: 'image/svg+xml' });
  downloadBlob(blob, `${baseName()}.svg`);
  done(blob, 'svg', started);
});

$('qr-panel').addEventListener('input', update);
$('qr-panel').addEventListener('change', update);
update();
