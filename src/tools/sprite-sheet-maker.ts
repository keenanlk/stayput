import { createShell, num, str, bool, radio, type ShellFile } from '../lib/shell';
import { canvasToBlob, decodeImage, thumbnail } from '../lib/image';
import { baseName, formatBytes, type OutputFile } from '../lib/files';
import { InputError, NamedError, UnreadableFile } from '../lib/input-error';
import { DamagedGif, checkGif, explain, gifSize, UnreadableFile as GifUnreadable } from '../lib/gif-errors';
import { isPhoneBrowser } from '../lib/phone-limit';
import { gifWriter } from '../lib/encoders';
import { MAX_PIXELS, MAX_PIXELS_PHONE, keptCount, layoutSheet, sheetJson, sliceSheet, trimTrailingEmpty, type Layout } from '../lib/sprite-sheet';

/**
 * Sprite sheet maker. Make a sheet: a GIF (frame by frame, see src/lib/gif-compress.ts) or a set of
 * pictures is drawn onto one canvas and saved as a PNG, with an optional JSON of the frames. Sheet to GIF:
 * a sheet is cut into cells and written as a GIF. Everything happens in this tab; file names and frame
 * order are never sent anywhere.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('ss-panel');
const canvas = $<HTMLCanvasElement>('ss-canvas');
const hint = $('ss-hint');
const run = document.getElementById('run');

const mode = (): 'sheet' | 'gif' => (radio('mode', 'sheet') === 'gif' ? 'gif' : 'sheet');
const MAX_GIF_FRAMES = 600;
const ADVICE = 'Choose a smaller Frame size or a bigger Frame step, or try a computer.';
const maxPixels = () => (isPhoneBrowser() ? MAX_PIXELS_PHONE : MAX_PIXELS);

/** True for a file that starts with the GIF signature. */
async function isGif(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer().catch(() => new ArrayBuffer(0)));
  return String.fromCharCode(...head) === 'GIF';
}

/** A picture decoded, or a named failure: a plain Error from the decoder becomes UnreadableFile. */
const decode = (file: File) =>
  decodeImage(file).catch((e: unknown) => {
    throw e instanceof Error && e.name !== 'Error' ? e : new UnreadableFile(`${file.name} could not be read as a picture. Check that it is a PNG, JPG, WebP or GIF.`);
  });

const readBytes = (file: File) =>
  file.arrayBuffer().catch(() => {
    throw new GifUnreadable();
  });

/** Draw `bitmap` into a cell of the sheet, scaled down to fit (never up) and centred. */
function drawInCell(ctx: OffscreenCanvasRenderingContext2D, source: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number) {
  const k = Math.min(1, w / sw, h / sh);
  const dw = Math.max(1, Math.round(sw * k));
  const dh = Math.max(1, Math.round(sh * k));
  ctx.drawImage(source, x + Math.floor((w - dw) / 2), y + Math.floor((h - dh) / 2), dw, dh);
}

interface Settings {
  columns: number;
  padding: number;
  background: string;
  step: number;
  scale: number;
  json: boolean;
}
const sheetSettings = (): Settings => ({
  columns: Math.round(num('ss-columns', 0)),
  padding: Math.min(16, Math.max(0, Math.round(num('ss-padding', 0)))),
  background: str('ss-bg', 'transparent'),
  step: Math.max(1, Math.round(num('ss-step', 1))),
  scale: Math.min(1, Math.max(0.05, num('ss-scale', 1))),
  json: bool('ss-json'),
});

async function makeSheet(files: ShellFile[], progress: { set(text: string, fraction?: number): void }): Promise<OutputFile[]> {
  const s = sheetSettings();
  const delays: number[] = [];
  let layout: Layout | undefined;
  let sheet: OffscreenCanvas | undefined;
  let ctx: OffscreenCanvasRenderingContext2D | undefined;
  let cell = { w: 0, h: 0 };
  let used = 0;

  /** Work out the layout from the first frame's size and the number of frames to come; nothing is drawn if it is too big. */
  const start = (w: number, h: number, count: number) => {
    cell = { w: Math.max(1, Math.round(w * s.scale)), h: Math.max(1, Math.round(h * s.scale)) };
    layout = layoutSheet(count, cell.w, cell.h, { columns: s.columns, padding: s.padding, maxPixels: maxPixels() });
    sheet = new OffscreenCanvas(layout.width, layout.height);
    ctx = sheet.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (s.background !== 'transparent') {
      ctx.fillStyle = s.background;
      ctx.fillRect(0, 0, layout.width, layout.height);
    }
  };

  // Count the frames first, so a sheet that would be too big is refused before any are decoded or drawn.
  const kinds = await Promise.all(files.map((f) => isGif(f.file)));
  const buffers: (ArrayBuffer | undefined)[] = [];
  const { gifFrameCount, eachGifFrame } = await import('../lib/gif-compress');
  let all = 0;
  let first: { w: number; h: number } | undefined;
  for (const [i, f] of files.entries()) {
    if (!kinds[i]) {
      all++;
      continue;
    }
    const buffer = await readBytes(f.file);
    buffers[i] = buffer;
    let frames = 0;
    checkGif(new Uint8Array(buffer), () => (frames = (() => {
      try {
        return gifFrameCount(buffer);
      } catch {
        throw new DamagedGif();
      }
    })()), s.scale, s.step);
    const size = gifSize(new Uint8Array(buffer))!;
    first ??= { w: size.width, h: size.height };
    all += frames;
  }
  const total = keptCount(all, s.step);
  if (total < 1) throw new InputError('Add a GIF or some pictures to put on a sheet.');
  // A GIF as the first file gives the cell size before any decoding; pictures give it once the first is decoded.
  if (first && kinds[0]) start(first.w, first.h, total);

  let seq = 0;
  const place = (source: CanvasImageSource, sw: number, sh: number, delay: number) => {
    if (seq++ % s.step !== 0) {
      // A frame skipped by the step adds its time to the frame before it, so the animation keeps its length.
      if (delays.length) delays[delays.length - 1]! += delay;
      return;
    }
    const c = layout!.cells[used++]!;
    drawInCell(ctx!, source, sw, sh, c.x, c.y, c.w, c.h);
    delays.push(delay);
  };

  for (const [i, f] of files.entries()) {
    const share = (x: number) => (i + x) / files.length;
    if (kinds[i]) {
      await eachGifFrame(buffers[i]!, async (screen, info) => {
        place(screen, screen.width, screen.height, info.delay);
        progress.set(`Drawing ${f.file.name}: frame ${info.index + 1} of ${info.total}`, share((info.index + 1) / info.total) * 0.9);
      }).catch((e) => {
        throw explain(e, ADVICE);
      });
    } else {
      progress.set(`Reading picture ${i + 1} of ${files.length}`, share(0) * 0.9);
      const { bitmap } = await decode(f.file);
      try {
        if (!layout) start(bitmap.width, bitmap.height, total);
        place(bitmap, bitmap.width, bitmap.height, 100);
      } finally {
        bitmap.close();
      }
    }
  }
  if (!layout || !sheet) throw new InputError('Add a GIF or some pictures to put on a sheet.');
  const finalLayout: Layout = layout;
  progress.set('Saving the PNG', 0.95);
  const png = await canvasToBlob(sheet, 'image/png').catch(() => {
    throw new NamedError('PngEncodeFailed', 'The browser could not save this sheet as a PNG. Try a smaller Frame size or fewer frames.');
  });
  const bmp = await createImageBitmap(sheet);
  const preview = await thumbnail(bmp, 160);
  bmp.close();
  const stem = files.length === 1 ? baseName(files[0]!.file.name) : 'sprite';
  const sheetName = `${stem}-sprite-sheet.png`;
  const outs: OutputFile[] = [
    {
      name: sheetName,
      blob: png,
      previewUrl: preview,
      originalSize: files.reduce((t, f) => t + f.file.size, 0),
      note: `${layout.width}×${layout.height} px, ${used} frame${used === 1 ? '' : 's'} in ${layout.columns} column${layout.columns === 1 ? '' : 's'}, ${formatBytes(png.size)}`,
    },
  ];
  if (s.json) {
    outs.push({ name: `${stem}-sprite-sheet.json`, blob: new Blob([sheetJson(sheetName, finalLayout, delays)], { type: 'application/json' }), badge: 'JSON', note: `${used} frames: x, y, w, h and delay in ms` });
  }
  return outs;
}

// ---- Sprite sheet to GIF ----

interface Cut {
  bitmap: ImageBitmap;
  layout: Layout;
}
let cut: Cut | undefined;
let timer: number | undefined;
let generation = 0;

interface GifSettings {
  by: 'grid' | 'size';
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  gap: number;
  delay: number;
  loop: boolean;
  trim: boolean;
}
const gifSettings = (): GifSettings => ({
  by: str('ss-by', 'grid') === 'size' ? 'size' : 'grid',
  cols: num('ss-cols', 4),
  rows: num('ss-rows', 4),
  cw: num('ss-cw', 64),
  ch: num('ss-ch', 64),
  gap: Math.min(16, Math.max(0, Math.round(num('ss-gap', 0)))),
  delay: Math.min(10000, Math.max(20, Math.round(num('ss-delay', 100)))),
  loop: bool('ss-loop'),
  trim: bool('ss-trim'),
});

function cutLayout(bitmap: ImageBitmap, g: GifSettings): Layout {
  return sliceSheet(bitmap.width, bitmap.height, g.by === 'grid' ? { columns: g.cols, rows: g.rows } : { cellW: g.cw, cellH: g.ch }, g.gap);
}

/** Which of the cells (in order) hold no visible pixel. */
function emptyCells(bitmap: ImageBitmap, layout: Layout): boolean[] {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(bitmap, 0, 0);
  return layout.cells.map((cell) => {
    const d = x.getImageData(cell.x, cell.y, cell.w, cell.h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) return false;
    return true;
  });
}

function frameCount(bitmap: ImageBitmap, layout: Layout, trim: boolean): number {
  return trim ? trimTrailingEmpty(emptyCells(bitmap, layout)) : layout.cells.length;
}

function drawCell(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, bitmap: ImageBitmap, c: { x: number; y: number; w: number; h: number }) {
  ctx.clearRect(0, 0, c.w, c.h);
  ctx.drawImage(bitmap, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
}

function play() {
  window.clearTimeout(timer);
  if (mode() !== 'gif' || !cut) return;
  const g = gifSettings();
  let layout: Layout;
  let n: number;
  try {
    layout = cutLayout(cut.bitmap, g);
    n = frameCount(cut.bitmap, layout, g.trim);
  } catch (e) {
    panel.hidden = false;
    canvas.width = 1;
    canvas.height = 1;
    hint.textContent = e instanceof Error ? e.message : String(e);
    return;
  }
  panel.hidden = false;
  const cell = layout.cells[0]!;
  canvas.width = cell.w;
  canvas.height = cell.h;
  const ctx = canvas.getContext('2d')!;
  const bitmap = cut.bitmap;
  hint.textContent = `${n} frame${n === 1 ? '' : 's'} of ${cell.w} × ${cell.h} px (${layout.columns} × ${layout.rows} cells), ${g.delay} ms each: ${((n * g.delay) / 1000).toFixed(2)} s ${g.loop ? 'on a loop' : 'played once'}.`;
  let i = 0;
  const step = () => {
    drawCell(ctx, bitmap, layout.cells[i]!);
    i++;
    if (i >= n) {
      i = 0;
      // The preview keeps looping so it can be judged; "played once" shows a pause before the replay.
      timer = window.setTimeout(step, g.loop ? g.delay : g.delay + 1500);
      return;
    }
    timer = window.setTimeout(step, g.delay);
  };
  step();
}

/** Show or hide the controls for the chosen mode, and refresh the preview. */
function syncMode() {
  const gif = mode() === 'gif';
  $('ss-a').hidden = gif;
  $('ss-b').hidden = !gif;
  if (run) run.textContent = gif ? 'Make GIF' : 'Make sprite sheet';
  const byGrid = str('ss-by', 'grid') !== 'size';
  for (const el of document.querySelectorAll<HTMLElement>('.ss-grid')) el.hidden = !byGrid;
  for (const el of document.querySelectorAll<HTMLElement>('.ss-size')) el.hidden = byGrid;
  if (!gif) {
    window.clearTimeout(timer);
    panel.hidden = true;
  } else {
    void loadSheet();
  }
}

async function loadSheet() {
  const files = shell.files;
  const mine = ++generation;
  window.clearTimeout(timer);
  if (mode() !== 'gif' || files.length === 0) {
    cut?.bitmap.close();
    cut = undefined;
    panel.hidden = true;
    return;
  }
  try {
    const { bitmap } = await decode(files[0]!.file);
    if (mine !== generation) {
      bitmap.close();
      return;
    }
    cut?.bitmap.close();
    cut = { bitmap, layout: sliceSheet(bitmap.width, bitmap.height, { columns: 1, rows: 1 }) };
    play();
  } catch (e) {
    panel.hidden = false;
    hint.textContent = e instanceof Error ? e.message : String(e);
  }
}

async function makeGif(files: ShellFile[], progress: { set(text: string, fraction?: number): void }): Promise<OutputFile[]> {
  if (files.length !== 1) throw new InputError('Add one sprite sheet to cut into a GIF.');
  const g = gifSettings();
  progress.set('Reading the sheet', 0.05);
  const { bitmap } = await decode(files[0]!.file);
  try {
    const layout = cutLayout(bitmap, g);
    const n = frameCount(bitmap, layout, g.trim);
    const cell = layout.cells[0]!;
    if (n > MAX_GIF_FRAMES) throw new NamedError('TooManyFrames', `That cut gives ${n} frames; a GIF is limited to ${MAX_GIF_FRAMES} here. Use fewer columns and rows, or a bigger cell size.`);
    const c = new OffscreenCanvas(cell.w, cell.h);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const writer = gifWriter(g.loop ? 0 : 1, { exact: true });
    let thumb: string | undefined;
    for (let i = 0; i < n; i++) {
      drawCell(ctx, bitmap, layout.cells[i]!);
      writer.add(ctx.getImageData(0, 0, cell.w, cell.h), g.delay);
      if (i === 0) {
        const b = await createImageBitmap(c);
        thumb = await thumbnail(b, 160);
        b.close();
      }
      progress.set(`Frame ${i + 1} of ${n}`, 0.1 + ((i + 1) / n) * 0.85);
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    const blob = new Blob([writer.finish() as BlobPart], { type: 'image/gif' });
    return [
      {
        name: `${baseName(files[0]!.file.name)}.gif`,
        blob,
        previewUrl: thumb,
        originalSize: files[0]!.file.size,
        note: `${cell.w}×${cell.h} px, ${n} frames, ${g.delay} ms each, ${g.loop ? 'loops' : 'plays once'}, ${formatBytes(blob.size)}`,
      },
    ];
  } finally {
    bitmap.close();
  }
}

const shell = createShell({
  outputFormat: () => (mode() === 'gif' ? 'gif' : 'png'),
  resultsTitle: (outs) => (mode() === 'gif' ? 'Your GIF' : outs.length > 1 ? 'Your sprite sheet and JSON' : 'Your sprite sheet'),
  onFilesChanged: () => loadSheet(),
  async process(files, progress) {
    return (mode() === 'gif' ? makeGif(files, progress) : makeSheet(files, progress)).catch((e) => {
      throw explain(e, ADVICE);
    });
  },
});

for (const el of document.querySelectorAll<HTMLElement>('input[name="mode"], #ss-by')) el.addEventListener('change', syncMode);
for (const el of document.querySelectorAll<HTMLElement>('#ss-b input, #ss-b select')) {
  el.addEventListener('input', play);
  el.addEventListener('change', play);
}
syncMode();
