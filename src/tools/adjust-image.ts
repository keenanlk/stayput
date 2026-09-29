import { createShell, processEach, bindRange, num, str, bool } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { adjust, describe, isNeutral, sharpenRadius, type Adjustments } from '../lib/adjust';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('adjust-panel');
const canvas = $<HTMLCanvasElement>('adjust-canvas');
const hint = $('adjust-hint');
const compare = $<HTMLButtonElement>('adjust-compare');
const reset = $<HTMLButtonElement>('adjust-reset');

const SLIDERS = ['brightness', 'contrast', 'saturation', 'warmth', 'sharpen'] as const;
bindRange('quality', 'quality-out');
for (const id of SLIDERS) bindRange(id, `${id}-out`, (v) => (id !== 'sharpen' && v > 0 ? `+${v}` : String(v)));

const settings = (): Adjustments => ({
  brightness: num('brightness', 0),
  contrast: num('contrast', 0),
  saturation: num('saturation', 0),
  warmth: num('warmth', 0),
  sharpen: num('sharpen', 0),
  invert: bool('invert'),
});

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */
const PREVIEW_MAX = 1200;
let preview: ImageBitmap | undefined;
/** The preview's original pixels at preview size, so each redraw starts from them. */
let original: ImageData | undefined;
let fullRadius = 1;
let count = 0;
let showingOriginal = false;

function loadPreview(bitmap: ImageBitmap) {
  const scale = Math.min(1, PREVIEW_MAX / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  original = ctx.getImageData(0, 0, canvas.width, canvas.height);
  fullRadius = sharpenRadius(bitmap.width, bitmap.height) * scale;
}

let frame = 0;
function redraw() {
  if (!original || frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!original) return;
    const a = settings();
    const img = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
    if (!showingOriginal) adjust(img.data, img.width, img.height, a, fullRadius);
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    const what = describe(a);
    panel.dataset.settings = what;
    hint.textContent = showingOriginal
      ? 'Showing the original. Let go to see the changes.'
      : what
        ? `Preview: ${what}.${count > 1 ? ` The same settings apply to all ${count} images.` : ''}`
        : 'Move a slider to adjust the picture. The preview updates as you go.';
    reset.disabled = isNeutral(a);
  });
}
for (const el of document.querySelectorAll<HTMLInputElement>('[data-adjust]')) {
  el.addEventListener('input', redraw);
  el.addEventListener('change', redraw);
}
const hold = (on: boolean) => {
  showingOriginal = on;
  compare.setAttribute('aria-pressed', String(on));
  redraw();
};
compare.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  hold(true);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) compare.addEventListener(ev, () => showingOriginal && hold(false));
compare.addEventListener('keydown', (e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && hold(true));
compare.addEventListener('keyup', () => showingOriginal && hold(false));
reset.addEventListener('click', () => {
  for (const id of SLIDERS) {
    const el = $<HTMLInputElement>(id);
    el.value = '0';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  $<HTMLInputElement>('invert').checked = false;
  redraw();
});

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
    original = undefined;
    if (files.length === 0) {
      panel.hidden = true;
      return;
    }
    try {
      preview = (await decodeImage(files[0]!.file)).bitmap;
      loadPreview(preview);
      panel.hidden = false;
      redraw();
    } catch (e) {
      panel.hidden = true;
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const a = settings();
    if (isNeutral(a)) throw new Error('Move at least one slider, or tick Invert, first: with every setting at 0 the picture would come out unchanged.');
    const choice = str('format', 'keep');
    const quality = num('quality', 92) / 100;
    return processEach(files, progress, 'Adjusting', async (entry) => {
      const decoded = await decodeImage(entry.file);
      const type = outputType(entry.file, choice);
      try {
        const c = document.createElement('canvas');
        c.width = decoded.bitmap.width;
        c.height = decoded.bitmap.height;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        // JPG has no transparency, so transparent pixels become white rather than black.
        if (type === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
        }
        ctx.drawImage(decoded.bitmap, 0, 0);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        adjust(img.data, c.width, c.height, a);
        ctx.putImageData(img, 0, 0);
        const blob = await canvasToBlob(c, type, type === 'image/png' ? undefined : quality);
        if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
        const bmp = await createImageBitmap(c);
        const out: OutputFile = {
          name: suffixName(entry.file.name, a.invert && describe(a) === 'inverted' ? '-inverted' : '-adjusted', extForType(type)),
          blob,
          originalSize: entry.file.size,
          previewUrl: await thumbnail(bmp),
          note: describe(a),
        };
        bmp.close();
        return out;
      } finally {
        decoded.bitmap.close();
      }
    });
  },
});
