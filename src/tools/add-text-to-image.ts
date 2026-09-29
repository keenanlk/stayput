import { createShell, processEach, bindRange, num, str, bool } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { drawText, loadFont, type Box, type Effect, type FontChoice, type TextBlock, type TextStyle } from '../lib/image-text';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('text-panel');
const canvas = $<HTMLCanvasElement>('text-canvas');
const which = $('text-which');
const text1 = $<HTMLTextAreaElement>('text1');
const text2 = $<HTMLTextAreaElement>('text2');
const pos = [$<HTMLInputElement>('pos1'), $<HTMLInputElement>('pos2')];
const color = $<HTMLInputElement>('color');

bindRange('quality', 'quality-out');
bindRange('size', 'size-out');
bindRange('opacity', 'opacity-out', (v) => `${v}%`);

const readPos = (el: HTMLInputElement): [number, number] => {
  const [x, y] = el.value.split(',').map(Number);
  return [Number.isFinite(x) ? x! : 0.5, Number.isFinite(y) ? y! : 0.5];
};

function blocks(): TextBlock[] {
  return [text1, text2].map((t, i) => {
    const [x, y] = readPos(pos[i]!);
    return { text: t.value, x, y };
  });
}

function style(): TextStyle {
  return {
    font: str('font', 'sans') as FontChoice,
    size: num('size', 8),
    color: color.value,
    effect: str('effect', 'outline') as Effect,
    opacity: num('opacity', 100) / 100,
    upper: bool('upper'),
    align: 'center',
  };
}

/* ------------------------------------------------------------------ */
/* Preview and dragging                                                */
/* ------------------------------------------------------------------ */
let preview: ImageBitmap | undefined;
let boxes: Box[] = [];
let selected = 0;
let count = 0;

function redraw() {
  const s = style();
  void loadFont(s.font).then(() => {
    if (!preview) return;
    const scale = Math.min(1, 1400 / Math.max(preview.width, preview.height));
    canvas.width = Math.max(1, Math.round(preview.width * scale));
    canvas.height = Math.max(1, Math.round(preview.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
    boxes = drawText(ctx, canvas.width, canvas.height, blocks(), s);
    panel.dataset.boxes = JSON.stringify(boxes.map((b) => [b.x / canvas.width, b.y / canvas.height, b.w / canvas.width, b.h / canvas.height].map((n) => +n.toFixed(3))));
  });
  which.textContent = text2.value.trim() ? (selected === 0 ? 'First text:' : 'Second text:') : 'Text:';
}

function toImage(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
}

/** The block under the pointer, or the nearest one with text. */
function pick(x: number, y: number): number {
  const px = x * canvas.width;
  const py = y * canvas.height;
  let best = selected;
  let bestD = Infinity;
  boxes.forEach((b, i) => {
    if (!b.w) return;
    const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
    const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

let drag: { index: number; dx: number; dy: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!preview) return;
  const [x, y] = toImage(e);
  selected = pick(x, y);
  const [bx, by] = readPos(pos[selected]!);
  drag = { index: selected, dx: bx - x, dy: by - y };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('is-dragging');
  redraw();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const [x, y] = toImage(e);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  pos[drag.index]!.value = `${clamp(x + drag.dx).toFixed(4)},${clamp(y + drag.dy).toFixed(4)}`;
  redraw();
});
const endDrag = () => {
  drag = null;
  canvas.classList.remove('is-dragging');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-place]')) {
  b.addEventListener('click', () => {
    pos[selected]!.value = b.dataset.place!;
    redraw();
  });
}
for (const s of document.querySelectorAll<HTMLButtonElement>('.swatch')) {
  s.addEventListener('click', () => {
    color.value = s.dataset.color!;
    redraw();
  });
}
text1.addEventListener('focus', () => {
  selected = 0;
  redraw();
});
text2.addEventListener('focus', () => {
  selected = 1;
  redraw();
});
for (const el of document.querySelectorAll<HTMLElement>('#text1, #text2, #font, #effect, #color, #size, #opacity, #upper')) {
  el.addEventListener('input', redraw);
  el.addEventListener('change', redraw);
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
function outputType(file: File, choice: string): EncodeType {
  if (choice !== 'keep') return choice as EncodeType;
  if (file.type === 'image/png') return 'image/png';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

const shell = createShell({
  async onFilesChanged(files) {
    count = files.length;
    preview?.close();
    preview = undefined;
    if (files.length === 0) {
      panel.hidden = true;
      return;
    }
    try {
      preview = (await decodeImage(files[0]!.file)).bitmap;
      panel.hidden = false;
      $('text-hint').textContent = `Drag the text on the picture to move it.${count > 1 ? ` The same text goes in the same place on all ${count} images.` : ''}`;
      if (!text1.value.trim() && !text2.value.trim()) text1.value = 'Your text';
      redraw();
    } catch (e) {
      panel.hidden = true;
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const list = blocks();
    if (!list.some((b) => b.text.trim())) throw new Error('Type some text first; the image would come out unchanged.');
    const s = style();
    await loadFont(s.font);
    const choice = str('format', 'keep');
    const quality = num('quality', 92) / 100;
    return processEach(files, progress, 'Adding text to', async (entry) => {
      const decoded = await decodeImage(entry.file);
      const type = outputType(entry.file, choice);
      const c = document.createElement('canvas');
      c.width = decoded.bitmap.width;
      c.height = decoded.bitmap.height;
      const ctx = c.getContext('2d')!;
      if (type === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
      }
      ctx.drawImage(decoded.bitmap, 0, 0);
      drawText(ctx, c.width, c.height, list, s);
      const blob = await canvasToBlob(c, type, type === 'image/png' ? undefined : quality);
      if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
      const bmp = await createImageBitmap(c);
      const out: OutputFile = {
        name: suffixName(entry.file.name, '-text', extForType(type)),
        blob,
        originalSize: entry.file.size,
        previewUrl: await thumbnail(bmp),
        note: `${c.width}×${c.height}, text added`,
      };
      bmp.close();
      decoded.bitmap.close();
      return out;
    });
  },
});
