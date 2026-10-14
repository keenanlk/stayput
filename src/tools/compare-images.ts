import { createShell, type ShellFile } from '../lib/shell';
import { canvasToBlob, decodeImage, drawScaled, makeCanvas } from '../lib/image';
import { formatBytes, suffixName, type OutputFile } from '../lib/files';
import { InputError } from '../lib/input-error';
import { aspectDiffers, diffPixels, diffSize, formatPercent, type DiffResult } from '../lib/image-diff';

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const resultEl = $('cmp-result');
const readout = $('cmp-readout');
const warn = $('cmp-warn');
const canvas = $<HTMLCanvasElement>('cmp-canvas');
const pos = $<HTMLInputElement>('cmp-pos');
const posOut = $('cmp-pos-out');
const posField = $('cmp-pos-field');
const posLabel = $('cmp-pos-label');
const threshold = $<HTMLInputElement>('cmp-threshold');
const thresholdOut = $('cmp-threshold-out');
const fit = $<HTMLInputElement>('cmp-fit');
const modeRadios = () => [...document.querySelectorAll<HTMLInputElement>('input[name="cmp-mode"]')];
const mode = () => modeRadios().find((r) => r.checked)?.value ?? 'slider';

interface Side {
  entry: ShellFile;
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

let a: Side | undefined;
let b: Side | undefined;
let layerA: Canvas | undefined;
let layerB: Canvas | undefined;
let diff: DiffResult | undefined;
let mapCanvas: Canvas | undefined;
let ticket = 0;

function release() {
  a?.bitmap.close();
  b?.bitmap.close();
  a = b = undefined;
  layerA = layerB = mapCanvas = undefined;
  diff = undefined;
}

const sizeText = (s: Side) => `${s.width}×${s.height} px, ${formatBytes(s.entry.file.size)}`;

function fillSlot(letter: 'a' | 'b', side: Side | undefined) {
  $(`cmp-name-${letter}`).textContent = side ? side.entry.file.name : `Drop image ${letter.toUpperCase()}`;
  $(`cmp-size-${letter}`).textContent = side ? sizeText(side) : '';
}

/** Draw both images onto white at the compare size, A at full fit and B fitted to A or at its own size. */
function layers(): { w: number; h: number; scaled: boolean } {
  const target = diffSize(a!.width, a!.height);
  const draw = (bitmap: ImageBitmap, w: number, h: number, ow: number, oh: number): Canvas => {
    const out = makeCanvas(ow, oh);
    const ctx = out.getContext('2d') as Ctx;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ow, oh);
    ctx.drawImage(drawScaled(bitmap, w, h), 0, 0);
    return out;
  };
  layerA = draw(a!.bitmap, target.width, target.height, target.width, target.height);
  if (fit.checked) {
    layerB = draw(b!.bitmap, target.width, target.height, target.width, target.height);
  } else {
    // Natural size: scale B by the same factor as A, and anything outside it stays white.
    const k = target.width / a!.width;
    const bw = Math.max(1, Math.round(b!.width * k));
    const bh = Math.max(1, Math.round(b!.height * k));
    layerB = draw(b!.bitmap, bw, bh, target.width, target.height);
  }
  return { w: target.width, h: target.height, scaled: target.scaled };
}

function computeDiff() {
  const w = layerA!.width;
  const h = layerA!.height;
  const da = (layerA!.getContext('2d') as Ctx).getImageData(0, 0, w, h).data;
  const db = (layerB!.getContext('2d') as Ctx).getImageData(0, 0, w, h).data;
  diff = diffPixels(da, db, Number(threshold.value));
  mapCanvas = makeCanvas(w, h);
  (mapCanvas.getContext('2d') as Ctx).putImageData(new ImageData(diff.map as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
}

function paint() {
  if (!layerA || !layerB) return;
  if (canvas.width !== layerA.width || canvas.height !== layerA.height) {
    canvas.width = layerA.width;
    canvas.height = layerA.height;
  }
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const m = mode();
  const p = Number(pos.value) / 100;
  posField.hidden = m === 'difference';
  posLabel.firstChild!.textContent = m === 'fade' ? 'Show B at ' : 'Divider ';
  ctx.clearRect(0, 0, w, h);
  if (m === 'difference' && mapCanvas) {
    ctx.drawImage(mapCanvas, 0, 0);
  } else if (m === 'fade') {
    ctx.drawImage(layerA, 0, 0);
    ctx.globalAlpha = p;
    ctx.drawImage(layerB, 0, 0);
    ctx.globalAlpha = 1;
  } else {
    ctx.drawImage(layerA, 0, 0);
    const x = Math.round(w * p);
    ctx.drawImage(layerB, x, 0, w - x, h, x, 0, w - x, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.max(0, x - 1), 0, 2, h);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(Math.max(0, x - 2), 0, 1, h);
    ctx.fillRect(x + 1, 0, 1, h);
  }
}

function report(scaled: boolean) {
  if (!diff || !a || !b) return;
  const text = `${formatPercent(diff.changed, diff.total)} of pixels differ`;
  readout.textContent = `${text}. A is ${a.width}×${a.height} px, B is ${b.width}×${b.height} px.`;
  readout.dataset.percent = diff.percent.toFixed(4);
  readout.dataset.changed = String(diff.changed);
  const notes: string[] = [];
  if (aspectDiffers(a.width, a.height, b.width, b.height)) {
    notes.push(fit.checked ? 'The two images have different aspect ratios, so B is stretched to fit A and most pixels will differ. Untick “Fit B to A’s size” to compare them at their own size instead.' : 'The two images have different aspect ratios, so they do not line up.');
  } else if (fit.checked && (a.width !== b.width || a.height !== b.height)) {
    notes.push(`B was scaled to A’s size (${a.width}×${a.height} px) before comparing.`);
  }
  if (scaled) notes.push(`A is large, so the comparison was made at ${canvas.width}×${canvas.height} px (4,096 px on the long side). The saved difference map is this size too.`);
  warn.textContent = notes.join(' ');
  warn.hidden = notes.length === 0;
}

async function recompute() {
  const mine = ++ticket;
  if (!a || !b) {
    resultEl.hidden = true;
    return;
  }
  resultEl.hidden = false;
  const { scaled } = layers();
  if (mine !== ticket) return;
  computeDiff();
  paint();
  report(scaled);
  resultEl.dataset.ready = String(mine);
}

function rethreshold() {
  thresholdOut.textContent = threshold.value;
  if (!layerA || !layerB) return;
  computeDiff();
  paint();
  report(diffSize(a!.width, a!.height).scaled);
}

async function load(files: ShellFile[]) {
  release();
  const pair = files.slice(0, 2);
  const sides: Side[] = [];
  for (const entry of pair) {
    const d = await decodeImage(entry.file);
    sides.push({ entry, bitmap: d.bitmap, width: d.width, height: d.height });
  }
  a = sides[0];
  b = sides[1];
  fillSlot('a', a);
  fillSlot('b', b);
  if (files.length > 2) shell.showError('Only the first two images are compared: A and B.');
  await recompute();
}

const shell = createShell({
  resultsTitle: () => 'Difference map ready',
  autoDownloadSingle: false,
  onFilesChanged: (files) => load(files),
  async process(files, progress) {
    if (files.length < 2 || !a || !b || !mapCanvas) throw new InputError('Add two images: A and B.');
    progress.set('Saving the difference map…', 0.5);
    const out: OutputFile = {
      name: suffixName(a.entry.file.name, '-difference', 'png'),
      blob: await canvasToBlob(mapCanvas, 'image/png'),
      originalSize: a.entry.file.size,
      note: `${formatPercent(diff!.changed, diff!.total)} of pixels differ, ${mapCanvas.width}×${mapCanvas.height} px`,
    };
    return [out];
  },
});

// Per-slot pickers: replacing one image keeps the other.
function bindSlot(letter: 'a' | 'b') {
  const slot = $(`cmp-slot-${letter}`);
  const input = $<HTMLInputElement>(`cmp-file-${letter}`);
  const set = async (file: File | undefined) => {
    if (!file) return;
    const files = shell.files.map((f) => f.file);
    if (letter === 'a') files[0] = file;
    else {
      if (files.length === 0) files.push(file); // B first: A is empty, so it lands in A until a second arrives
      else files[1] = file;
    }
    $<HTMLButtonElement>('clear').click();
    await shell.addFiles(files.slice(0, 2));
  };
  slot.addEventListener('click', () => input.click());
  slot.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    void set(input.files?.[0]);
    input.value = '';
  });
  slot.addEventListener('dragover', (e) => {
    e.preventDefault();
    slot.classList.add('is-over');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('is-over'));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    slot.classList.remove('is-over');
    void set(e.dataTransfer?.files[0]);
  });
}
bindSlot('a');
bindSlot('b');

$('cmp-swap').addEventListener('click', async () => {
  const files = shell.files.map((f) => f.file);
  if (files.length < 2) return;
  $<HTMLButtonElement>('clear').click();
  await shell.addFiles([files[1]!, files[0]!]);
});

pos.addEventListener('input', () => {
  posOut.textContent = pos.value;
  paint();
});
threshold.addEventListener('input', rethreshold);
fit.addEventListener('change', () => void recompute());
for (const r of modeRadios()) r.addEventListener('change', paint);

// Drag the divider on the picture itself.
let dragging = false;
const moveTo = (clientX: number) => {
  const rect = canvas.getBoundingClientRect();
  const v = Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 100);
  pos.value = String(v);
  posOut.textContent = String(v);
  paint();
};
canvas.addEventListener('pointerdown', (e) => {
  if (mode() === 'difference') return;
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  moveTo(e.clientX);
});
canvas.addEventListener('pointermove', (e) => dragging && moveTo(e.clientX));
canvas.addEventListener('pointerup', () => (dragging = false));
