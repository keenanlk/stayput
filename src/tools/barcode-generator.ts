import JsBarcode from 'jsbarcode';
import { bool, createShell, num, str } from '../lib/shell';
import { downloadBlob } from '../lib/files';
import { trackToolRun } from '../lib/analytics';
import { luminance } from '../lib/contrast';
import { imagesToPdf } from '../lib/pdf';
import { SYMBOLOGIES, barcodeName, checkBarcode, widthError, type BarcodeOk, type Symbology } from '../lib/barcode';

/**
 * Barcode generator. The barcode is drawn in this page from what is typed, so
 * a product number or an asset ID never reaches a server. src/lib/barcode.ts
 * decides what each type accepts and works out the check digit; JsBarcode
 * only ever sees a value that module has passed.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const frame = $('bc-frame');
const canvas = $<HTMLCanvasElement>('bc-canvas');
const info = $('bc-info');
const pngBtn = $<HTMLButtonElement>('bc-png');
const svgBtn = $<HTMLButtonElement>('bc-svg');
const pdfBtn = $<HTMLButtonElement>('bc-pdf');
const buttons = [pngBtn, svgBtn, pdfBtn];

// The shell supplies the privacy panel and next steps; files are never added here.
createShell({ process: async () => [] });

/** Bearer bars are this many bar widths thick, on all four sides. */
const BEARER_BARS = 5;
const SVG_NS = 'http://www.w3.org/2000/svg';

let current: { symbology: Symbology; ok: BarcodeOk } | undefined;
let firstOk = true;

const symbology = () => str('bc-type', 'code128') as Symbology;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

interface Look {
  bar: number;
  height: number;
  quiet: number;
  text: boolean;
  size: number;
  dark: string;
  light: string;
  clear: boolean;
  bearer: boolean;
}

function look(): Look {
  return {
    bar: clamp(num('bc-bar', 3), 1, 8),
    height: clamp(num('bc-height', 100), 30, 400),
    quiet: clamp(num('bc-quiet', 11), 0, 20),
    text: bool('bc-text'),
    size: clamp(num('bc-size', 20), 10, 40),
    dark: str('bc-dark', '#000000'),
    light: str('bc-light', '#ffffff'),
    clear: bool('bc-clear'),
    bearer: symbology() === 'itf14' && bool('bc-bearer'),
  };
}

function options(l: Look, ok: BarcodeOk) {
  return {
    format: ok.format,
    width: l.bar,
    height: l.height,
    displayValue: l.text,
    fontSize: l.size,
    font: 'monospace',
    textAlign: 'center',
    textPosition: 'bottom',
    textMargin: 2,
    lineColor: l.dark,
    background: l.clear ? '' : l.light,
    marginTop: 10,
    marginBottom: 10,
    marginLeft: l.quiet * l.bar,
    marginRight: l.quiet * l.bar,
    flat: false,
  };
}

/** Draw into `target`, with a bearer frame around the barcode when asked. */
function drawCanvas(target: HTMLCanvasElement, ok: BarcodeOk, l: Look) {
  if (!l.bearer) {
    JsBarcode(target, ok.value, options(l, ok));
    return;
  }
  const inner = document.createElement('canvas');
  JsBarcode(inner, ok.value, options(l, ok));
  const t = BEARER_BARS * l.bar;
  target.width = inner.width + 2 * t;
  target.height = inner.height + 2 * t;
  const ctx = target.getContext('2d')!;
  ctx.clearRect(0, 0, target.width, target.height);
  if (!l.clear) {
    ctx.fillStyle = l.light;
    ctx.fillRect(0, 0, target.width, target.height);
  }
  ctx.drawImage(inner, t, t);
  ctx.fillStyle = l.dark;
  ctx.fillRect(0, 0, target.width, t);
  ctx.fillRect(0, target.height - t, target.width, t);
  ctx.fillRect(0, t, t, inner.height);
  ctx.fillRect(target.width - t, t, t, inner.height);
}

function svgMarkup(ok: BarcodeOk, l: Look): string {
  const inner = document.createElementNS(SVG_NS, 'svg');
  JsBarcode(inner, ok.value, options(l, ok));
  let svg = inner;
  if (l.bearer) {
    const t = BEARER_BARS * l.bar;
    const w = parseFloat(inner.getAttribute('width')!) + 2 * t;
    const h = parseFloat(inner.getAttribute('height')!) + 2 * t;
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('version', '1.1');
    svg.setAttribute('width', `${w}px`);
    svg.setAttribute('height', `${h}px`);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const rect = (x: number, y: number, rw: number, rh: number, fill: string) => {
      const r = document.createElementNS(SVG_NS, 'rect');
      for (const [k, v] of Object.entries({ x, y, width: rw, height: rh, fill })) r.setAttribute(k, String(v));
      svg.appendChild(r);
    };
    if (!l.clear) rect(0, 0, w, h, l.light);
    inner.setAttribute('x', String(t));
    inner.setAttribute('y', String(t));
    svg.appendChild(inner);
    rect(0, 0, w, t, l.dark);
    rect(0, h - t, w, t, l.dark);
    rect(0, t, t, h - 2 * t, l.dark);
    rect(w - t, t, t, h - 2 * t, l.dark);
  }
  svg.setAttribute('shape-rendering', 'crispEdges');
  return new XMLSerializer().serializeToString(svg);
}

/** Modules across, from JsBarcode's own encoding, so the width guard needs no canvas. */
function modulesOf(ok: BarcodeOk): number {
  const out: { encodings?: { data: string }[] } = {};
  JsBarcode(out, ok.value, { format: ok.format });
  return (out.encodings ?? []).reduce((sum, e) => sum + e.data.length, 0);
}

function say(text: string, warn = false) {
  info.textContent = text;
  info.classList.toggle('is-warn', warn);
}

function reset(message: string, warn: boolean) {
  current = undefined;
  frame.dataset.state = 'empty';
  for (const b of buttons) b.disabled = true;
  say(message, warn);
}

/** True for the red and orange bars that red-light scanners cannot see. */
function redLike(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return r >= 180 && b <= 100 && g <= r * 0.75;
}

function update() {
  const type = symbology();
  for (const el of document.querySelectorAll<HTMLElement>('.bc-opt')) el.classList.toggle('is-active', el.dataset.for === (type === 'code39' ? 'code39' : type === 'itf14' ? 'itf14' : ''));
  $('bc-size').toggleAttribute('disabled', !bool('bc-text'));
  const example = SYMBOLOGIES.find((s) => s.id === type)?.example ?? '';
  $<HTMLInputElement>('bc-value').placeholder = example;

  const checked = checkBarcode(type, str('bc-value'), { mod43: bool('bc-mod43') });
  if (!checked.ok) return reset(checked.message, !!checked.message);

  const l = look();
  const tooWide = widthError(modulesOf(checked), l.bar, l.quiet * l.bar);
  if (tooWide) return reset(tooWide, true);
  try {
    drawCanvas(canvas, checked, l);
  } catch {
    return reset('This barcode could not be drawn. Check the number and try again.', true);
  }
  current = { symbology: type, ok: checked };
  frame.dataset.state = 'ready';
  for (const b of buttons) b.disabled = false;

  const notes = [checked.note, `The barcode is ${canvas.width} × ${canvas.height} px.`].filter(Boolean);
  const warnings: string[] = [];
  if (!l.clear && luminance(l.dark) > luminance(l.light)) warnings.push('The bars are lighter than the background, and scanners cannot read inverted barcodes. Swap the colours.');
  else if (!l.clear && (luminance(l.light) + 0.05) / (luminance(l.dark) + 0.05) < 3) warnings.push('The colours are close; keep strong contrast so scanners can read it.');
  else if (redLike(l.dark)) warnings.push('Some scanners use red light and cannot see red or orange bars. Black on white is safest.');
  if (l.quiet < 7) warnings.push('Scanners need blank space beside the bars. Less blank space can make the barcode fail to scan.');
  if (l.bar === 1) warnings.push('At 1 px per bar, a barcode is easy to blur when it is resized. Use 2 px or more, or save the SVG.');
  say([...notes, ...warnings].join(' '), warnings.length > 0);
}

function done(blob: Blob, ext: 'png' | 'svg' | 'pdf', started: number) {
  trackToolRun({ tool: root.dataset.slug ?? 'barcode-generator', outcome: 'ok', firstOk, files: 0, inputBytes: 0, outputBytes: blob.size, ms: performance.now() - started, format: `${current?.symbology ?? 'code128'}-${ext}` });
  firstOk = false;
  root.dispatchEvent(new CustomEvent('stayput:done'));
}

function pngBlob(c: NonNullable<typeof current>): Promise<Blob | null> {
  const out = document.createElement('canvas');
  drawCanvas(out, c.ok, look());
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

pngBtn.addEventListener('click', async () => {
  if (!current) return;
  const started = performance.now();
  const c = current;
  const blob = await pngBlob(c);
  if (!blob) return;
  downloadBlob(blob, `${barcodeName(c.symbology, c.ok.value)}.png`);
  done(blob, 'png', started);
});

svgBtn.addEventListener('click', () => {
  if (!current) return;
  const started = performance.now();
  const blob = new Blob([svgMarkup(current.ok, look())], { type: 'image/svg+xml' });
  downloadBlob(blob, `${barcodeName(current.symbology, current.ok.value)}.svg`);
  done(blob, 'svg', started);
});

pdfBtn.addEventListener('click', async () => {
  if (!current) return;
  const started = performance.now();
  const c = current;
  const png = await pngBlob(c);
  if (!png) return;
  const bytes = await imagesToPdf([{ kind: 'png', bytes: new Uint8Array(await png.arrayBuffer()) }], { pageSize: 'fit', orientation: 'auto', margin: 0 });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  downloadBlob(blob, `${barcodeName(c.symbology, c.ok.value)}.pdf`);
  done(blob, 'pdf', started);
});

$('bc-example').addEventListener('click', () => {
  const input = $<HTMLInputElement>('bc-value');
  input.value = SYMBOLOGIES.find((s) => s.id === symbology())?.example ?? '';
  update();
  input.focus();
});

$('bc-panel').addEventListener('input', update);
$('bc-panel').addEventListener('change', update);
update();
