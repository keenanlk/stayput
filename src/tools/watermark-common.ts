import { bindRange, num, radio, str } from '../lib/shell';
import { drawWatermark, type Layout, type WatermarkOptions } from '../lib/watermark';

bindRange('wm-size', 'wm-size-out');
bindRange('wm-opacity', 'wm-opacity-out');

export function watermarkOptions(): WatermarkOptions {
  return {
    text: str('wm-text', ''),
    layout: radio('layout', 'center') as Layout,
    size: num('wm-size', 5),
    opacity: num('wm-opacity', 30) / 100,
    color: str('wm-color', '#808080'),
  };
}

export function requireText(o: WatermarkOptions): void {
  if (!o.text.trim()) throw new Error('Type the watermark text first.');
}

const panel = document.getElementById('wm-panel')!;
const canvas = document.getElementById('wm-canvas') as HTMLCanvasElement;
const hint = document.getElementById('wm-hint')!;

/**
 * The preview: `base` (a photo or rendered page, already scaled down) with the
 * watermark drawn at the same proportions as the saved file.
 */
let base: ImageBitmap | HTMLCanvasElement | undefined;
let baseHint = '';

export function setPreview(source: ImageBitmap | HTMLCanvasElement | undefined, text = ''): void {
  base = source;
  baseHint = text;
  panel.hidden = !source;
  redraw();
}

function redraw() {
  if (!base) return;
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(base, 0, 0);
  drawWatermark(ctx, base.width, base.height, watermarkOptions());
  hint.textContent = baseHint;
}

const options = document.getElementById('options');
options?.addEventListener('input', redraw);
options?.addEventListener('change', redraw);
