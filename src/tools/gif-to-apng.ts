import { createShell, processEach } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { gifToApng } from '../lib/gif-apng';

/**
 * GIF to animated PNG. Each GIF is decoded and written as an APNG in the page (see
 * src/lib/gif-apng.ts); nothing leaves the tab.
 */

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

createShell({
  outputFormat: () => 'png',
  async process(files, progress) {
    return processEach(files, progress, 'Converting', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${entry.file.name}…`, share(0.02));
      const bytes = await entry.file.arrayBuffer();
      const r = await gifToApng(bytes, (f) => progress.set(`Converting ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.05 + f * 0.95)));
      const out: OutputFile = {
        name: replaceExt(entry.file.name, 'png'),
        blob: new Blob([r.bytes], { type: 'image/png' }),
        originalSize: entry.file.size,
        previewUrl: await thumbnail(r.poster),
        note: `${r.width}×${r.height}, ${r.frames} frames, ${seconds(r.duration)}, ${r.plays === 0 ? 'loops forever' : r.plays === 1 ? 'plays once' : `plays ${r.plays} times`}`,
      };
      r.poster.close();
      return out;
    });
  },
});
