import { bindRange, createShell, num, processEach, str } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { DamagedGif, UnreadableFile, checkGif, explain } from '../lib/gif-errors';

/**
 * GIF to animated WebP. Each GIF is decoded in the page, every frame is encoded by the WebAssembly
 * WebP encoder (fetched from this site on the first run) and the frames are wrapped in an animated
 * WebP (see src/lib/gif-webp.ts); nothing leaves the tab.
 */

bindRange('quality', 'quality-out');
const mode = document.getElementById('webp-mode') as HTMLSelectElement | null;
const qualityField = document.getElementById('quality-field');
const syncMode = () => {
  if (qualityField && mode) qualityField.hidden = mode.value === 'lossless';
};
mode?.addEventListener('change', syncMode);
syncMode();

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

createShell({
  outputFormat: () => 'webp',
  async process(files, progress) {
    const lossless = str('webp-mode', 'lossy') === 'lossless';
    const quality = Math.min(100, Math.max(1, Math.round(num('quality', 80))));
    const { gifToWebp } = await import('../lib/gif-webp');
    return processEach(files, progress, 'Converting', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${entry.file.name}…`, share(0.02));
      const buffer = await entry.file.arrayBuffer().catch(() => {
        throw new UnreadableFile();
      });
      const bytes = new Uint8Array(buffer);
      // Refuse anything that is not a GIF before the encoder is fetched.
      checkGif(bytes, undefined, 1, 1);
      const r = await gifToWebp(buffer, {
        lossless,
        quality,
        onProgress: (f) => progress.set(`Converting ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.05 + f * 0.95)),
      }).catch((e) => {
        throw e instanceof Error && /^This GIF has no frames/.test(e.message) ? new DamagedGif() : explain(e);
      });
      const out: OutputFile = {
        name: replaceExt(entry.file.name, 'webp'),
        blob: new Blob([r.bytes], { type: 'image/webp' }),
        originalSize: entry.file.size,
        previewUrl: await thumbnail(r.poster),
        note: `${r.width}×${r.height}, ${r.frames} frames, ${seconds(r.duration)}, ${r.plays === 0 ? 'loops forever' : r.plays === 1 ? 'plays once' : `plays ${r.plays} times`}, ${lossless ? 'lossless' : `quality ${quality}`}`,
      };
      r.poster.close();
      return out;
    });
  },
});
