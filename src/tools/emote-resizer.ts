import { createShell, bool, radio, str, processEach } from '../lib/shell';
import { canvasToBlob, decodeImage, drawExact, drawScaled, makeCanvas, type Fit } from '../lib/image';
import { adjust, NEUTRAL } from '../lib/adjust';
import { replaceExt, suffixName, type OutputFile } from '../lib/files';

/** Sizes each platform asks for, largest first, and its per-file limit in bytes (1 KB = 1000 bytes, as the platforms count). */
const PLATFORMS: Record<string, { sizes: number[]; limit: number; label: string; limitLabel: string }> = {
  'twitch-emote': { sizes: [112, 56, 28], limit: 1_000_000, label: 'Twitch', limitLabel: '1 MB' },
  'twitch-badge': { sizes: [72, 36, 18], limit: 25_000, label: 'Twitch', limitLabel: '25 KB' },
  'discord-emoji': { sizes: [128], limit: 256_000, label: 'Discord', limitLabel: '256 KB' },
  'discord-sticker': { sizes: [320], limit: 512_000, label: 'Discord', limitLabel: '512 KB' },
  'slack-emoji': { sizes: [128], limit: 128_000, label: 'Slack', limitLabel: '128 KB' },
};

/** Sizes at or below this get a light unsharp mask, since downscaling softens fine lines most there. */
const SHARPEN_AT = 36;

/** Crop away fully transparent rows and columns, found on a copy no larger than 1024 px. */
async function trimmed(bitmap: ImageBitmap): Promise<ImageBitmap | undefined> {
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const probe = drawScaled(bitmap, w, h);
  const ctx = probe.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const { data } = ctx.getImageData(0, 0, w, h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return undefined;
  const sx = Math.max(0, Math.floor(x0 / scale) - 1);
  const sy = Math.max(0, Math.floor(y0 / scale) - 1);
  const ex = Math.min(bitmap.width, Math.ceil((x1 + 1) / scale) + 1);
  const ey = Math.min(bitmap.height, Math.ceil((y1 + 1) / scale) + 1);
  return createImageBitmap(bitmap, sx, sy, ex - sx, ey - sy);
}

function sharpened(canvas: HTMLCanvasElement | OffscreenCanvas): HTMLCanvasElement | OffscreenCanvas {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.drawImage(canvas, 0, 0);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  adjust(image.data, out.width, out.height, { ...NEUTRAL, sharpen: 35 }, 1);
  ctx.putImageData(image, 0, 0);
  return out;
}

createShell({
  resultsTitle: (outs) => `Done: ${outs.length} ${outs.length === 1 ? 'image' : 'images'}`,
  async process(files, progress) {
    const platform = PLATFORMS[str('platform', 'twitch-emote')] ?? PLATFORMS['twitch-emote']!;
    const fit = radio('fit', 'contain') as Fit;
    const trim = bool('trim');
    const sharpen = bool('sharpen');
    return processEach(files, progress, 'Resizing', async (entry) => {
      const decoded = await decodeImage(entry.file);
      const cut = trim ? await trimmed(decoded.bitmap) : undefined;
      const source = cut ?? decoded.bitmap;
      try {
        const outs: OutputFile[] = [];
        const largest = platform.sizes[0]!;
        const small = fit === 'cover' ? Math.min(source.width, source.height) < largest : Math.max(source.width, source.height) < largest;
        for (const size of platform.sizes) {
          let canvas = await drawExact(source, size, size, fit);
          if (sharpen && size <= SHARPEN_AT) canvas = sharpened(canvas);
          const blob = await canvasToBlob(canvas, 'image/png');
          const notes = [`${size}×${size}`];
          if (blob.size > platform.limit) notes.push(`over ${platform.label}’s ${platform.limitLabel} limit; simplify the image`);
          else if (size === largest && small) notes.push(`enlarged from ${source.width}×${source.height}`);
          const name = platform.sizes.length > 1 ? suffixName(entry.file.name, `-${size}`, 'png') : replaceExt(entry.file.name, 'png');
          outs.push({ name, blob, previewUrl: URL.createObjectURL(blob), note: notes.join(' · ') });
        }
        return outs;
      } finally {
        cut?.close();
        decoded.bitmap.close();
      }
    });
  },
});
