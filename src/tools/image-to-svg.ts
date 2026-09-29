import { createShell, processEach, radio, bool } from '../lib/shell';
import { decodeImage, drawScaled } from '../lib/image';
import { formatBytes, replaceExt, type OutputFile } from '../lib/files';
import { toMono } from '../lib/mono';
import type { Pixels, TraceMode, TraceOptions, TraceResult } from '../lib/trace';
import type { TraceReply, TraceRequest } from '../lib/trace.worker';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('svg-panel');
const original = $<HTMLCanvasElement>('svg-original');
const previewImg = $<HTMLImageElement>('svg-preview');
const caption = $('svg-caption');
const hint = $('svg-hint');

const LABEL: Record<TraceMode, string> = { bw: 'black and white', logo: 'logo, few colours', detailed: 'detailed, many colours' };
const mode = () => radio('mode', 'logo') as TraceMode;

/** Longest side, in pixels, that is traced. Small images are enlarged first so the curves come out smooth. */
const PREVIEW_MAX = 480;
const MIN_SIDE = 400;
const maxSide = (m: TraceMode) => (m === 'detailed' ? 800 : 1000);

let worker: Worker | undefined;
let nextId = 0;
function trace(image: Pixels, options: TraceOptions): Promise<TraceResult> {
  worker ??= new Worker(new URL('../lib/trace.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<TraceReply>) => {
      if (e.data.id !== id) return;
      done();
      if (e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error ?? 'Tracing failed.'));
    };
    const onError = (e: ErrorEvent) => {
      done();
      worker = undefined;
      w.terminate();
      reject(new Error(e.message || 'Tracing failed.'));
    };
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, image, options } satisfies TraceRequest, [image.data.buffer]);
  });
}

/** The pixels to trace, at a size between MIN_SIDE and `max`, and the scale back to the image's own size. */
function pixelsFor(bitmap: ImageBitmap, m: TraceMode, max: number): { pixels: Pixels; scale: number } {
  const long = Math.max(bitmap.width, bitmap.height);
  const k = Math.min(max / long, Math.max(1, MIN_SIDE / long));
  const width = Math.max(1, Math.round(bitmap.width * k));
  const height = Math.max(1, Math.round(bitmap.height * k));
  // Black and white is judged against a white page, so transparent areas count as background.
  const c = drawScaled(bitmap, width, height, m === 'bw' ? '#ffffff' : undefined);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, width, height);
  if (m === 'bw') toMono(img.data, 'bw');
  else {
    // Each traced shape has one solid fill, so a soft edge is either in or out;
    // left half-transparent, it would be traced as a ring of its own colour.
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i]! < 128 ? 0 : 255;
  }
  return { pixels: { width, height, data: img.data }, scale: bitmap.width / width };
}

async function toSvg(bitmap: ImageBitmap, m: TraceMode, dropWhite: boolean, max: number): Promise<TraceResult> {
  const { pixels, scale } = pixelsFor(bitmap, m, max);
  return trace(pixels, { mode: m, dropWhite, scale });
}

const describe = (r: TraceResult, bytes: number) =>
  `${r.paths.toLocaleString('en')} shape${r.paths === 1 ? '' : 's'} in ${r.colours} colour${r.colours === 1 ? '' : 's'}, ${formatBytes(bytes)}`;

let preview: ImageBitmap | undefined;
let previewUrl: string | undefined;
let count = 0;
let generation = 0;
async function redraw() {
  if (!preview) return;
  const gen = ++generation;
  const m = mode();
  panel.dataset.busy = '';
  hint.textContent = 'Tracing…';
  try {
    const r = await toSvg(preview, m, bool('drop-white'), PREVIEW_MAX);
    if (gen !== generation) return;
    const blob = new Blob([r.svg], { type: 'image/svg+xml' });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    previewImg.src = previewUrl;
    caption.textContent = `SVG preview: ${describe(r, blob.size)}`;
    hint.textContent = `Preview traced at ${PREVIEW_MAX} px in the ${LABEL[m]} style; the download is traced at up to ${maxSide(m)} px.${count > 1 ? ` The same style applies to all ${count} images.` : ''}`;
  } catch (e) {
    if (gen === generation) hint.textContent = e instanceof Error ? e.message : String(e);
  } finally {
    if (gen === generation) delete panel.dataset.busy;
  }
}
for (const el of document.querySelectorAll<HTMLInputElement>('input[name="mode"], #drop-white')) el.addEventListener('change', redraw);

function showOriginal(bitmap: ImageBitmap) {
  const k = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
  original.width = Math.max(1, Math.round(bitmap.width * k));
  original.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = original.getContext('2d')!;
  ctx.clearRect(0, 0, original.width, original.height);
  ctx.drawImage(bitmap, 0, 0, original.width, original.height);
}

const shell = createShell({
  async onFilesChanged(files) {
    count = files.length;
    preview?.close();
    preview = undefined;
    generation++;
    if (files.length === 0) {
      panel.hidden = true;
      return;
    }
    try {
      preview = (await decodeImage(files[0]!.file)).bitmap;
      showOriginal(preview);
      panel.hidden = false;
      await redraw();
    } catch (e) {
      panel.hidden = true;
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const m = mode();
    const dropWhite = bool('drop-white');
    return processEach(files, progress, 'Tracing', async (entry) => {
      const decoded = await decodeImage(entry.file);
      try {
        const r = await toSvg(decoded.bitmap, m, dropWhite, maxSide(m));
        if (r.paths === 0) throw new Error('Nothing was left to trace. The image may be blank, or all white with “Leave out white” ticked.');
        const blob = new Blob([r.svg], { type: 'image/svg+xml' });
        const out: OutputFile = {
          name: replaceExt(entry.file.name, 'svg'),
          blob,
          originalSize: entry.file.size,
          previewUrl: URL.createObjectURL(blob),
          note: `${decoded.width}×${decoded.height}, ${describe(r, blob.size)}`,
        };
        return out;
      } finally {
        decoded.bitmap.close();
      }
    });
  },
});
