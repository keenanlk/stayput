import { createShell, processEach, bindRange, bool, num, str } from '../lib/shell';
import { canvasToBlob, decodeImage, drawScaled, makeCanvas, thumbnail } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { autoPalette, snapToPalette, PALETTES } from '../lib/pixel-art';
import { effectPreview } from '../lib/effect-preview';

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

bindRange('grid', 'grid-out');
document.getElementById('fx-canvas')?.classList.add('pixelated');

/** The pixel grid for a picture: `across` columns (never more than the picture has) and rows in proportion. */
function gridSize(bitmap: ImageBitmap, across: number) {
  const cols = Math.max(1, Math.min(across, bitmap.width));
  const rows = Math.max(1, Math.round((cols * bitmap.height) / bitmap.width));
  return { cols, rows };
}

/** Shrink to the grid, snap to the palette, then enlarge each block to `scale` pixels with no smoothing. */
function render(bitmap: ImageBitmap, longest: number | undefined): { canvas: Canvas; cols: number; rows: number; colours: number } {
  const { cols, rows } = gridSize(bitmap, Math.round(num('grid', 64)));
  const small = drawScaled(bitmap, cols, rows);
  const sctx = small.getContext('2d') as Ctx;
  const img = sctx.getImageData(0, 0, cols, rows);
  const choice = str('palette', 'auto-16');
  const palette = choice.startsWith('auto-') ? autoPalette(img.data, Number(choice.slice(5))) : PALETTES[choice] ?? PALETTES.pico8!;
  snapToPalette(img.data, cols, rows, palette, bool('dither'));
  sctx.putImageData(img, 0, 0);
  const scale = longest === undefined ? 1 : Math.max(1, Math.floor(longest / Math.max(cols, rows)));
  if (scale === 1) return { canvas: small, cols, rows, colours: palette.length };
  const big = makeCanvas(cols * scale, rows * scale);
  const ctx = big.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, big.width, big.height);
  if (bool('grid-lines') && scale >= 4) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let x = 1; x < cols; x++) ctx.fillRect(x * scale, 0, 1, big.height);
    for (let y = 1; y < rows; y++) ctx.fillRect(0, y * scale, big.width, 1);
  }
  return { canvas: big, cols, rows, colours: palette.length };
}

const shell = createShell({
  resultsTitle: (outs) => `Done: ${outs.length} pixel art ${outs.length === 1 ? 'image' : 'images'}`,
  onFilesChanged: (files) => onFiles(files),
  async process(files, progress) {
    const longest = str('output', 'large') === 'large' ? 1024 : undefined;
    return processEach(files, progress, 'Pixelating', async (entry) => {
      const decoded = await decodeImage(entry.file);
      try {
        const { canvas, cols, rows, colours } = render(decoded.bitmap, longest);
        const blob = await canvasToBlob(canvas, 'image/png');
        const bmp = await createImageBitmap(canvas);
        const out: OutputFile = {
          name: suffixName(entry.file.name, '-pixel-art', 'png'),
          blob,
          originalSize: entry.file.size,
          previewUrl: await thumbnail(bmp),
          note: `${cols}×${rows} pixels, ${colours} colours${canvas.width !== cols ? `, saved at ${canvas.width}×${canvas.height}` : ''}`,
        };
        bmp.close();
        return out;
      } finally {
        decoded.bitmap.close();
      }
    });
  },
});

const onFiles = effectPreview(
  (bitmap, maxSide) => render(bitmap, maxSide).canvas,
  (count) => `Preview of the first picture.${count > 1 ? ` The same settings apply to all ${count}.` : ''}`,
  (m) => shell.showError(m),
);
