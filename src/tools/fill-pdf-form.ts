import { bool, createShell } from '../lib/shell';
import { closePdfJs, loadDocument, openWithPdfJs } from '../lib/pdf';
import { fillForm, readForm, type FormField } from '../lib/pdf-form';
import { suffixName, type OutputFile } from '../lib/files';
import type * as PdfJs from 'pdfjs-dist';

/**
 * Fill PDF form. pdf.js draws each page; the form's fields, read with pdf-lib,
 * sit over it as ordinary inputs. The answers are written into the PDF in the
 * tab when you save. Nothing is uploaded.
 */

const panel = document.getElementById('form-panel')!;
const pagesEl = document.getElementById('form-pages')!;
const countEl = document.getElementById('form-count')!;
const emptyEl = document.getElementById('form-empty')!;
const resetBtn = document.getElementById('form-reset') as HTMLButtonElement;

let fields: FormField[] = [];
let values: Record<string, string> = {};
let original: Record<string, string> = {};
let pdf: PdfJs.PDFDocumentProxy | undefined;
let token = 0;

const fillable = () => fields.filter((f) => !f.readOnly && f.kind !== 'signature' && f.kind !== 'button');
const answeredCount = () => fillable().filter((f) => values[f.name] && values[f.name] !== 'false').length;

function updateCount() {
  const n = fillable().length;
  if (!n) {
    countEl.textContent = '';
    return;
  }
  const pages = new Set(fillable().flatMap((f) => f.widgets.map((w) => w.page))).size;
  countEl.textContent = `${answeredCount()} of ${n} field${n === 1 ? '' : 's'} filled, on ${pages} page${pages === 1 ? '' : 's'}`;
}

/** Keep every input for a field (a field can appear on several pages) in step. */
function setValue(name: string, value: string, from?: HTMLElement) {
  values[name] = value;
  for (const el of pagesEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-field="${CSS.escape(name)}"]`)) {
    if (el === from) continue;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = value === 'true';
    else if (el instanceof HTMLInputElement && el.type === 'radio') el.checked = el.value === value;
    else el.value = value;
  }
  updateCount();
}

function inputFor(f: FormField, option: string | undefined, heightPx: number): HTMLElement {
  let el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const label = f.name.replace(/\[\d+\]/g, '').split('.').pop() || f.name;
  if (f.kind === 'multiline') {
    el = document.createElement('textarea');
    el.value = values[f.name] ?? '';
  } else if (f.kind === 'checkbox' || f.kind === 'radio') {
    const box = document.createElement('input');
    box.type = f.kind;
    if (f.kind === 'radio') {
      box.name = `radio:${f.name}`;
      box.value = option ?? '';
      box.checked = !!option && values[f.name] === option;
    } else box.checked = values[f.name] === 'true';
    box.style.setProperty('--mark', `${Math.max(8, heightPx * 0.8)}px`);
    el = box;
  } else if (f.kind === 'dropdown' || f.kind === 'list') {
    const sel = document.createElement('select');
    sel.add(new Option('', ''));
    for (const o of f.options ?? []) sel.add(new Option(o, o));
    sel.value = values[f.name] ?? '';
    el = sel;
  } else {
    const t = document.createElement('input');
    t.type = 'text';
    t.value = values[f.name] ?? '';
    if (f.maxLength !== undefined) t.maxLength = f.maxLength;
    t.autocomplete = 'off';
    el = t;
  }
  el.className = 'form-field';
  el.dataset.field = f.name;
  el.setAttribute('aria-label', f.kind === 'radio' && option ? `${label}: ${option}` : label);
  el.title = f.kind === 'radio' && option ? `${label}: ${option}` : label;
  if (f.kind === 'signature') {
    el.disabled = true;
    el.classList.add('is-signature');
    el.title = 'Signature box: use Sign PDF to sign it';
  } else if (f.readOnly || f.kind === 'button') el.disabled = true;
  if (f.kind !== 'checkbox' && f.kind !== 'radio') {
    // Size the text to the box, as PDF readers do for auto-sized fields.
    el.style.fontSize = `${Math.max(8, Math.min(16, f.kind === 'multiline' ? 12 : heightPx * 0.62))}px`;
  }
  const commit = () => {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') setValue(f.name, String(el.checked), el);
    else if (el instanceof HTMLInputElement && el.type === 'radio') {
      if (el.checked) setValue(f.name, el.value, el);
    } else setValue(f.name, el.value, el);
  };
  el.addEventListener('input', commit);
  el.addEventListener('change', commit);
  return el;
}

async function showPages(doc: PdfJs.PDFDocumentProxy, mine: number) {
  const width = Math.min(860, pagesEl.clientWidth - 24 || 860);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const onPage = new Map<number, { f: FormField; w: FormField['widgets'][number] }[]>();
  for (const f of fields) for (const w of f.widgets) onPage.set(w.page, [...(onPage.get(w.page) ?? []), { f, w }]);
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    if (mine !== token) return;
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const viewport = page.getViewport({ scale: scale * dpr });
    const shown = page.getViewport({ scale });
    const wrap = document.createElement('div');
    wrap.className = 'form-page';
    wrap.dataset.page = String(i + 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    // Draw the page without its form widgets: the inputs take their place.
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport, annotationMode: 0 }).promise;
    page.cleanup();
    if (mine !== token) return;
    wrap.append(canvas);
    const label = document.createElement('span');
    label.className = 'form-page-label';
    label.textContent = `Page ${i + 1} of ${doc.numPages}`;
    wrap.append(label);
    for (const { f, w } of onPage.get(i) ?? []) {
      const [x1, y1] = shown.convertToViewportPoint(w.rect[0], w.rect[1]) as [number, number];
      const [x2, y2] = shown.convertToViewportPoint(w.rect[2], w.rect[3]) as [number, number];
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const wPx = Math.abs(x2 - x1);
      const hPx = Math.abs(y2 - y1);
      const el = inputFor(f, w.option, hPx);
      el.style.left = `${(left / shown.width) * 100}%`;
      el.style.top = `${(top / shown.height) * 100}%`;
      el.style.width = `${(wPx / shown.width) * 100}%`;
      el.style.height = `${(hPx / shown.height) * 100}%`;
      wrap.append(el);
    }
    pagesEl.append(wrap);
  }
}

async function reset() {
  token++;
  if (pdf) await closePdfJs(pdf).catch(() => {});
  pdf = undefined;
  fields = [];
  values = {};
  original = {};
  pagesEl.replaceChildren();
  panel.hidden = true;
  emptyEl.hidden = true;
  countEl.textContent = '';
}

resetBtn.addEventListener('click', () => {
  for (const f of fillable()) setValue(f.name, f.kind === 'checkbox' ? 'false' : '');
});

createShell({
  autoDownloadSingle: true,
  async onFilesChanged(files) {
    await reset();
    const f = files[0];
    if (!f) return;
    const mine = token;
    const bytes = new Uint8Array(await f.file.arrayBuffer());
    const doc = await loadDocument(bytes);
    fields = await readForm(doc);
    for (const field of fields) values[field.name] = field.value;
    original = { ...values };
    if (mine !== token) return;
    panel.hidden = false;
    emptyEl.hidden = fillable().length > 0;
    resetBtn.hidden = fillable().length === 0;
    updateCount();
    pdf = await openWithPdfJs(bytes);
    await showPages(pdf, mine);
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (!fillable().length) throw new Error('This PDF has no fillable fields. Use Sign PDF to type text anywhere on its pages.');
    progress.set('Writing your answers into the form', 0.3);
    const changed: Record<string, string> = {};
    for (const f of fillable()) if (values[f.name] !== original[f.name]) changed[f.name] = values[f.name] ?? '';
    const flatten = bool('flatten');
    const out = await fillForm(new Uint8Array(await entry.file.arrayBuffer()), changed, { flatten });
    progress.set('Done', 1);
    const answered = answeredCount();
    const file: OutputFile = {
      name: suffixName(entry.file.name, '-filled', 'pdf'),
      blob: new Blob([out.bytes as BlobPart], { type: 'application/pdf' }),
      note: `${answered} of ${fillable().length} fields filled${out.flattened ? ', answers locked' : ''}`,
    };
    return [file];
  },
  resultsTitle: () => 'Form filled',
});
