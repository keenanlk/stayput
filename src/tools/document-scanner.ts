import { bool, createShell, radio, str, describeError, type Skipped } from '../lib/shell';
import { canvasToBlob, decodeImage, drawScaled } from '../lib/image';
import { imagesToPdf, type EmbeddableImage } from '../lib/pdf';
import { enhance, findPage, flatSize, inset, warp, type Look, type Quad } from '../lib/doc-scan';
import { suffixName, type OutputFile } from '../lib/files';

/**
 * Turn phone photos of paper into a clean scan (src/lib/doc-scan.ts): the
 * page is found, straightened and its lighting evened out, then the pages
 * are saved as one PDF or as images. Nothing is uploaded.
 */

/** Detection runs on a copy this size; the page itself is cut from the full photo. */
const DETECT = 400;
/** A4 at 300 dpi on the long side: sharp enough to print, small enough to email. */
const MAX_SIDE = 3508;

function pixels(bitmap: ImageBitmap, width: number, height: number): ImageData {
  const canvas = drawScaled(bitmap, width, height, '#fff');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  return ctx.getImageData(0, 0, width, height);
}

/** The page's corners in the photo's own pixels, or undefined when no page stands out. */
function locate(bitmap: ImageBitmap): Quad | undefined {
  const s = Math.min(1, DETECT / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * s));
  const h = Math.max(1, Math.round(bitmap.height * s));
  const data = pixels(bitmap, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  const q = findPage(gray, w, h);
  return q?.map(([x, y]) => [(x * bitmap.width) / w, (y * bitmap.height) / h]) as Quad | undefined;
}

/** Letter and Legal paper in North and Central America and the Philippines, A4 elsewhere. */
function regionalPaper(): 'a4' | 'letter' {
  const region = (navigator.language.split('-')[1] ?? '').toUpperCase();
  return ['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'CR', 'PA', 'DO', 'PR', 'SV'].includes(region) ? 'letter' : 'a4';
}

interface Scan {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  found: boolean;
}

async function scan(file: File, look: Look, crop: boolean): Promise<Scan> {
  const { bitmap } = await decodeImage(file);
  try {
    const quad = crop ? locate(bitmap) : undefined;
    const full: Quad = [[0, 0], [bitmap.width, 0], [bitmap.width, bitmap.height], [0, bitmap.height]];
    const corners = quad ? inset(quad, 0.012) : full;
    const { width, height } = flatSize(corners, MAX_SIDE);
    // Sample from the photo at no more than twice the output size: enough detail, bounded memory.
    const s = Math.min(1, (2 * Math.max(width, height)) / Math.max(bitmap.width, bitmap.height));
    const sw = Math.max(1, Math.round(bitmap.width * s));
    const sh = Math.max(1, Math.round(bitmap.height * s));
    const src = pixels(bitmap, sw, sh).data;
    const scaled = corners.map(([x, y]) => [(x * sw) / bitmap.width, (y * sh) / bitmap.height]) as Quad;
    const out = warp(src, sw, sh, scaled, width, height);
    enhance(out, width, height, look);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.putImageData(new ImageData(out, width, height), 0, 0);
    return { canvas, found: !!quad };
  } finally {
    bitmap.close();
  }
}

createShell({
  async thumbnail(file) {
    // Show where the page was found, so a missed edge is visible before running.
    const { bitmap } = await decodeImage(file);
    try {
      const s = 160 / Math.max(bitmap.width, bitmap.height);
      const w = Math.max(1, Math.round(bitmap.width * s));
      const h = Math.max(1, Math.round(bitmap.height * s));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const quad = bool('crop') ? locate(bitmap) : undefined;
      if (quad) {
        ctx.strokeStyle = '#1f9d55';
        ctx.lineWidth = 3;
        ctx.beginPath();
        quad.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
        ctx.closePath();
        ctx.stroke();
      }
      return canvas.toDataURL('image/jpeg', 0.8);
    } finally {
      bitmap.close();
    }
  },
  outputFormat: () => radio('output', 'pdf'),
  async process(files, progress) {
    const look = radio('look', 'color') as Look;
    const crop = bool('crop');
    const output = radio('output', 'pdf');
    const size = str('page-size', 'auto');
    const pageSize = size === 'auto' ? regionalPaper() : (size as 'a4' | 'letter');
    // Black and white compresses far better, and without smudges, as PNG.
    const type = look === 'bw' ? 'image/png' : 'image/jpeg';
    const outputs: OutputFile[] = [];
    const pages: EmbeddableImage[] = [];
    const skipped: Skipped[] = [];
    let missed = 0;
    let firstError: unknown;
    for (const [i, entry] of files.entries()) {
      progress.set(`Scanning ${entry.file.name} (${i + 1} of ${files.length})`, (i / files.length) * 0.9);
      try {
        const { canvas, found } = await scan(entry.file, look, crop);
        if (crop && !found) missed++;
        const blob = await canvasToBlob(canvas, type, 0.85);
        const note = crop && !found ? 'Page edges not found; the whole photo was kept' : `${canvas.width} × ${canvas.height} px`;
        if (output === 'pdf') pages.push({ kind: type === 'image/png' ? 'png' : 'jpg', bytes: new Uint8Array(await blob.arrayBuffer()) });
        else outputs.push({ name: suffixName(entry.file.name, '-scan', type === 'image/png' ? 'png' : 'jpg'), blob, originalSize: entry.file.size, note });
      } catch (e) {
        console.warn(`${entry.file.name}:`, e);
        firstError ??= e;
        skipped.push({ name: entry.file.name, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    if (output === 'pdf' && pages.length) {
      progress.set('Making the PDF', 0.95);
      const bytes = await imagesToPdf(pages, { pageSize, orientation: 'auto', margin: 0 });
      const edges = missed ? `; page edges not found in ${missed === 1 ? '1 photo' : `${missed} photos`}, kept whole` : '';
      outputs.push({
        name: files.length === 1 ? suffixName(files[0]!.file.name, '-scan', 'pdf') : 'scan.pdf',
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        note: `${pages.length} page${pages.length === 1 ? '' : 's'} on ${pageSize === 'a4' ? 'A4' : 'US Letter'}${edges}`,
      });
    }
    if (outputs.length === 0) throw new Error(describeError(files[0]!.file, firstError ?? 'nothing scanned'));
    return { outputs, skipped };
  },
  resultsTitle: () => 'Scanned',
});
