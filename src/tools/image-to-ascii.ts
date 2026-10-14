import { createShell, bindRange, bool, num, str } from '../lib/shell';
import { canvasToBlob, decodeImage, drawScaled, makeCanvas } from '../lib/image';
import { downloadBlob, suffixName, type OutputFile } from '../lib/files';
import { gridSize, rampFor, toAscii } from '../lib/ascii-art';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const panel = document.getElementById('ascii-panel')!;
const out = document.getElementById('ascii-out') as HTMLTextAreaElement;
const info = document.getElementById('ascii-info')!;
const copyBtn = document.getElementById('ascii-copy') as HTMLButtonElement;
const txtBtn = document.getElementById('ascii-txt') as HTMLButtonElement;
const pngBtn = document.getElementById('ascii-png') as HTMLButtonElement;
const charset = document.getElementById('charset') as HTMLSelectElement;

bindRange('cols', 'cols-out');
charset.addEventListener('change', () => {
  document.getElementById('custom-field')!.hidden = charset.value !== 'custom';
});

/** Each character is drawn in a 12 x 24 cell: the 1:2 shape the text grid assumes, so the PNG keeps the picture's proportions. */
const CELL_W = 12;
const CELL_H = 24;

let current: { text: string; png: Blob; txtName: string; pngName: string } | undefined;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

copyBtn.addEventListener('click', async () => {
  if (!current) return;
  const ok = await copyText(current.text);
  copyBtn.textContent = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => (copyBtn.textContent = 'Copy text'), 1600);
});
txtBtn.addEventListener('click', () => current && downloadBlob(new Blob([current.text], { type: 'text/plain' }), current.txtName));
pngBtn.addEventListener('click', () => current && downloadBlob(current.png, current.pngName));

/** Draw the text on a canvas; with colour on, each character takes its cell's average colour. */
async function drawPng(text: string, rgba: Uint8ClampedArray, cols: number, rows: number, colour: boolean, invert: boolean): Promise<Blob> {
  const canvas = makeCanvas(cols * CELL_W, rows * CELL_H);
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.fillStyle = invert ? '#000' : '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${CELL_H * 0.85}px ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const base = invert ? '#fff' : '#000';
  const lines = text.split('\n');
  for (let y = 0; y < rows; y++) {
    const chars = Array.from(lines[y] ?? '');
    for (let x = 0; x < cols; x++) {
      const ch = chars[x];
      if (!ch || ch === ' ') continue;
      if (colour) {
        const i = (y * cols + x) * 4;
        ctx.fillStyle = `rgb(${rgba[i]},${rgba[i + 1]},${rgba[i + 2]})`;
      } else {
        ctx.fillStyle = base;
      }
      ctx.fillText(ch, x * CELL_W + CELL_W / 2, y * CELL_H + CELL_H / 2);
    }
  }
  return canvasToBlob(canvas, 'image/png');
}

createShell({
  autoDownloadSingle: false,
  resultsTitle: () => 'Done: ASCII art as text and PNG',
  onFilesChanged: () => {
    panel.hidden = true;
    current = undefined;
  },
  async process(files, progress) {
    const entry = files[0]!;
    progress.set('Converting');
    panel.hidden = true;
    const decoded = await decodeImage(entry.file);
    try {
      // The picture is shrunk straight to one pixel per character before any pixel is read,
      // so a 24 MP photo is never sampled at full size.
      const { cols, rows } = gridSize(decoded.width, decoded.height, Math.round(num('cols', 100)));
      const small = drawScaled(decoded.bitmap, cols, rows);
      const img = (small.getContext('2d') as Ctx).getImageData(0, 0, cols, rows);
      const invert = bool('invert');
      const colour = bool('colour');
      const text = toAscii(img.data, cols, rows, rampFor(str('charset', 'classic'), str('custom')), invert);
      const png = await drawPng(text, img.data, cols, rows, colour, invert);
      current = { text, png, txtName: suffixName(entry.file.name, '-ascii', 'txt'), pngName: suffixName(entry.file.name, '-ascii', 'png') };
      out.value = text;
      info.textContent = `${cols} columns × ${rows} rows, from a ${decoded.width}×${decoded.height} picture.`;
      info.dataset.source = `${decoded.width}x${decoded.height}`;
      info.dataset.sampled = `${img.width}x${img.height}`;
      info.dataset.png = `${cols * CELL_W}x${rows * CELL_H}`;
      panel.hidden = false;
      const outs: OutputFile[] = [
        { name: current.txtName, blob: new Blob([text], { type: 'text/plain' }), originalSize: entry.file.size, note: `${cols}×${rows} characters` },
        { name: current.pngName, blob: png, originalSize: entry.file.size, note: `${cols * CELL_W}×${rows * CELL_H} pixels` },
      ];
      return outs;
    } finally {
      decoded.bitmap.close();
    }
  },
});

