import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { createShell, num, str, bool, type ShellFile } from '../lib/shell';
import { decodeImage, drawScaled, thumbnail } from '../lib/image';
import { formatBytes, type OutputFile } from '../lib/files';
import { frameSize, place, playOrder, type GifFit } from '../lib/gif-maker';

/**
 * Make one animated GIF from a set of pictures, in the order listed. Each
 * picture is drawn onto a frame the shape of the first one and given its own
 * 256-colour palette by gifenc (MIT). Nothing leaves the tab.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('gif-panel');
const canvas = $<HTMLCanvasElement>('gif-canvas');
const hint = $('gif-hint');
const background = $<HTMLInputElement>('background');

/** Past this many pictures the GIF runs to tens of megabytes. */
const MAX_FRAMES = 300;
const PREVIEW_WIDTH = 480;

interface Settings {
  delay: number;
  width: number;
  fit: GifFit;
  background: string;
  loop: boolean;
  bounce: boolean;
}
const settings = (): Settings => ({
  delay: num('delay', 0.5),
  width: num('width', 480),
  fit: str('fit', 'contain') as GifFit,
  background: background.value || '#ffffff',
  loop: bool('loop'),
  bounce: bool('bounce'),
});

/** Draw picture `bmp` onto the frame. */
function paint(ctx: CanvasRenderingContext2D, bmp: ImageBitmap, w: number, h: number, s: Settings) {
  ctx.fillStyle = s.background;
  ctx.fillRect(0, 0, w, h);
  const p = place(bmp.width, bmp.height, w, h, s.fit);
  ctx.drawImage(bmp, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
}

// Small copies of every picture, for the preview.
let thumbs: ImageBitmap[] = [];
let timer: number | undefined;
let generation = 0;

function play() {
  window.clearTimeout(timer);
  if (thumbs.length === 0) return;
  const s = settings();
  const size = frameSize(thumbs[0]!, Math.min(s.width, PREVIEW_WIDTH));
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const order = playOrder(thumbs.length, s.bounce);
  const seconds = order.length * s.delay;
  hint.textContent = `${thumbs.length} picture${thumbs.length === 1 ? '' : 's'}, ${s.delay} s each: ${seconds.toFixed(1)} s ${s.loop ? 'on a loop' : 'played once'}.${thumbs.length === 1 ? ' Add more pictures to animate.' : ''}`;
  let i = 0;
  const step = () => {
    paint(ctx, thumbs[order[i]!]!, size.width, size.height, s);
    i++;
    if (i >= order.length) {
      // The preview keeps looping so it can be judged; "played once" shows a pause before the replay.
      i = 0;
      timer = window.setTimeout(step, s.loop ? s.delay * 1000 : s.delay * 1000 + 1500);
      return;
    }
    timer = window.setTimeout(step, s.delay * 1000);
  };
  step();
}
for (const el of document.querySelectorAll<HTMLElement>('#delay, #width, #fit, #background, #loop, #bounce')) {
  el.addEventListener('input', play);
  el.addEventListener('change', play);
}
for (const sw of document.querySelectorAll<HTMLButtonElement>('.swatch')) {
  sw.addEventListener('click', () => {
    background.value = sw.dataset.color!;
    play();
  });
}

async function loadPreviews(files: ShellFile[]) {
  const mine = ++generation;
  const next: ImageBitmap[] = [];
  for (const f of files.slice(0, MAX_FRAMES)) {
    const { bitmap } = await decodeImage(f.file);
    const k = Math.min(1, PREVIEW_WIDTH / bitmap.width, PREVIEW_WIDTH / bitmap.height);
    const small = await createImageBitmap(drawScaled(bitmap, Math.max(1, Math.round(bitmap.width * k)), Math.max(1, Math.round(bitmap.height * k))));
    bitmap.close();
    if (mine !== generation) {
      small.close();
      next.forEach((b) => b.close());
      return;
    }
    next.push(small);
  }
  thumbs.forEach((b) => b.close());
  thumbs = next;
}

const shell = createShell({
  async onFilesChanged(files) {
    window.clearTimeout(timer);
    if (files.length === 0) {
      generation++;
      thumbs.forEach((b) => b.close());
      thumbs = [];
      panel.hidden = true;
      return;
    }
    try {
      await loadPreviews(files);
      panel.hidden = false;
      play();
    } catch (e) {
      panel.hidden = true;
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    if (files.length < 2) throw new Error('Add at least two pictures to make an animated GIF.');
    if (files.length > MAX_FRAMES) throw new Error(`That is ${files.length} pictures; the limit is ${MAX_FRAMES}. A GIF that long would be too large to share.`);
    const s = settings();
    const frames: ImageBitmap[] = [];
    try {
      let size: { width: number; height: number } | undefined;
      for (const [i, f] of files.entries()) {
        progress.set(`Reading ${f.file.name} (${i + 1} of ${files.length})`, (i / files.length) * 0.4);
        const { bitmap } = await decodeImage(f.file);
        size ??= frameSize(bitmap, s.width);
        // Keep a copy at about the frame size rather than every full-size photo.
        const k = Math.min(1, (2 * size.width) / bitmap.width, (2 * size.height) / bitmap.height);
        frames.push(k < 1 ? await createImageBitmap(drawScaled(bitmap, Math.round(bitmap.width * k), Math.round(bitmap.height * k))) : bitmap);
        if (k < 1) bitmap.close();
      }
      const { width, height } = size!;
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingQuality = 'high';
      const gif = GIFEncoder();
      const order = playOrder(frames.length, s.bounce);
      const delay = Math.round(s.delay * 1000);
      let preview: string | undefined;
      for (const [n, i] of order.entries()) {
        paint(ctx, frames[i]!, width, height, s);
        const { data } = ctx.getImageData(0, 0, width, height);
        const palette = quantize(data, 256, { format: 'rgb565' });
        gif.writeFrame(applyPalette(data, palette, 'rgb565'), width, height, { palette, delay, repeat: s.loop ? 0 : -1 });
        if (n === 0) {
          const bmp = await createImageBitmap(c);
          preview = await thumbnail(bmp);
          bmp.close();
        }
        progress.set(`Frame ${n + 1} of ${order.length}`, 0.4 + ((n + 1) / order.length) * 0.6);
      }
      gif.finish();
      const blob = new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
      const out: OutputFile = {
        name: 'animation.gif',
        blob,
        originalSize: files.reduce((t, f) => t + f.file.size, 0),
        previewUrl: preview,
        note: `${width}×${height}, ${order.length} frames, ${s.delay} s each, ${s.loop ? 'loops' : 'plays once'}, ${formatBytes(blob.size)}`,
      };
      return [out];
    } finally {
      frames.forEach((b) => b.close());
    }
  },
  resultsTitle: () => 'Your GIF',
});
