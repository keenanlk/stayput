import { createShell, bindRange, bool, num, str } from '../lib/shell';
import { canvasToBlob, decodeImage, drawScaled, fitSize, makeCanvas } from '../lib/image';
import { writeIco } from '../lib/encoders';
import { extOf, type OutputFile } from '../lib/files';

bindRange('padding', 'padding-out', (v) => `${v}%`);

/** The master every icon is resized from: large enough for the 512px manifest icon. */
const MASTER = 512;
/** Maskable icons are cropped to a circle of 80% diameter; keep the image inside it. */
const MASKABLE_INSET = 0.2;

/** Centre the image on a square, `inset` (a fraction of the side) clear on every edge, over an optional solid background. */
function square(bitmap: ImageBitmap, size: number, inset: number, background?: string): HTMLCanvasElement | OffscreenCanvas {
  const room = Math.max(1, Math.round(size * (1 - 2 * inset)));
  const largest = Math.max(bitmap.width, bitmap.height);
  const fit = fitSize(bitmap.width, bitmap.height, { maxWidth: room, maxHeight: room, scale: largest < room ? room / largest : 1 });
  const inner = drawScaled(bitmap, fit.width, fit.height);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.drawImage(inner, Math.round((size - fit.width) / 2), Math.round((size - fit.height) / 2));
  return canvas;
}

async function png(master: HTMLCanvasElement | OffscreenCanvas, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(master);
  try {
    return await canvasToBlob(size === master.width ? master : drawScaled(bitmap, size, size), 'image/png');
  } finally {
    bitmap.close();
  }
}

function manifest(name: string, color: string): string {
  const icons = [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  return `${JSON.stringify({ name, short_name: name, icons, theme_color: color, background_color: color, display: 'standalone' }, null, 2)}\n`;
}

function snippet(svg: boolean, color: string): string {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="32x32">',
    ...(svg ? ['<link rel="icon" href="/favicon.svg" type="image/svg+xml">'] : []),
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<meta name="theme-color" content="${color}">`,
  ].join('\n');
}

/* The copyable HTML lives under the results list and is cleared with them. */
const results = document.getElementById('results')!;
const block = document.createElement('div');
block.id = 'favicon-snippet';
block.className = 'snippet';
block.hidden = true;
block.innerHTML = `<div class="snippet-head"><span class="muted small">Put the files in your site’s root folder and paste this into your page’s <code>&lt;head&gt;</code>:</span><button class="btn btn-sm" type="button">Copy HTML</button></div><pre><code></code></pre>`;
results.querySelector('#results-list')!.after(block);
const code = block.querySelector('pre code')!;
const copy = block.querySelector('button')!;
copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(code.textContent ?? '');
    copy.textContent = 'Copied';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(code);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    copy.textContent = 'Press Ctrl+C';
  }
  setTimeout(() => (copy.textContent = 'Copy HTML'), 2000);
});
document.getElementById('tool')!.addEventListener('stayput:files', () => (block.hidden = true));

createShell({
  resultsTitle: (outs) => `Done: ${outs.length} icon files`,
  autoDownloadSingle: false,
  async process(files, progress) {
    const file = files[0]!.file;
    const inset = num('padding', 0) / 100;
    const color = str('background', '#ffffff');
    const name = str('app-name').trim() || 'My website';
    const isSvg = extOf(file.name) === 'svg' || file.type === 'image/svg+xml';
    progress.set('Reading the image', 0.05);
    const decoded = await decodeImage(file);
    const { bitmap, width, height } = decoded;
    try {
      const tab = square(bitmap, MASTER, inset, bool('fill-tab') ? color : undefined);
      const home = square(bitmap, MASTER, inset, color);
      const maskable = square(bitmap, MASTER, Math.max(inset, MASKABLE_INSET), color);
      const small = Math.max(width, height) < MASTER ? `enlarged from ${width}×${height}; use a 512px or larger image for sharp icons` : undefined;
      const outs: OutputFile[] = [];
      const add = async (fileName: string, blob: Blob, note?: string, preview: Blob | undefined = blob.type === 'image/png' ? blob : undefined) => {
        outs.push({ name: fileName, blob, previewUrl: preview && URL.createObjectURL(preview), badge: preview ? undefined : 'JSON', note });
      };
      progress.set('Writing favicon.ico', 0.25);
      const tabBitmap = await createImageBitmap(tab);
      const ico = await writeIco(tabBitmap, [16, 32, 48]);
      tabBitmap.close();
      await add('favicon.ico', new Blob([ico as BlobPart], { type: 'image/x-icon' }), '16, 32 and 48 px', await png(tab, 48));
      if (isSvg) await add('favicon.svg', new Blob([await file.arrayBuffer()], { type: 'image/svg+xml' }), 'scales to any size', file);
      progress.set('Writing PNG icons', 0.5);
      await add('favicon-16x16.png', await png(tab, 16), '16×16');
      await add('favicon-32x32.png', await png(tab, 32), '32×32');
      await add('apple-touch-icon.png', await png(home, 180), '180×180, iPhone and iPad');
      await add('icon-192.png', await png(home, 192), '192×192, Android');
      await add('icon-512.png', await png(home, 512), small ?? '512×512, Android and install');
      await add('icon-maskable-512.png', await png(maskable, 512), '512×512, safe zone for round masks');
      await add('site.webmanifest', new Blob([manifest(name, color)], { type: 'application/manifest+json' }), 'web app manifest');
      code.textContent = snippet(isSvg, color);
      block.hidden = false;
      progress.set('Done', 1);
      return outs;
    } finally {
      bitmap.close();
    }
  },
});
