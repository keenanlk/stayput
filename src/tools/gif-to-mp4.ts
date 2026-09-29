import { createShell, processEach, radio, str } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { gifToMp4 } from '../lib/gif-video';

/**
 * GIF to MP4. Each GIF is decoded and re-encoded as video in the page (see
 * src/lib/gif-video.ts); nothing leaves the tab.
 */

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

createShell({
  outputFormat: () => 'mp4',
  async process(files, progress) {
    const repeatValue = str('repeat', 'auto');
    const repeat = repeatValue === 'auto' ? 'auto' : Number(repeatValue);
    const background = radio('background', 'white') === 'black' ? '#000000' : '#ffffff';
    return processEach(files, progress, 'Converting', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${entry.file.name}…`, share(0.02));
      const bytes = await entry.file.arrayBuffer();
      const r = await gifToMp4(bytes, {
        repeat,
        background,
        onProgress: (f) => progress.set(`Encoding ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.05 + f * 0.95)),
      });
      const out: OutputFile = {
        name: replaceExt(entry.file.name, 'mp4'),
        blob: r.blob,
        originalSize: entry.file.size,
        previewUrl: await thumbnail(r.poster),
        note: `${r.width}×${r.height}, ${seconds(r.duration)}${r.plays > 1 ? ` (${r.plays} loops)` : ''}, ${r.codec}${r.codec === 'H.264' ? '' : ' (this browser has no H.264 encoder)'}`,
      };
      r.poster.close();
      return out;
    });
  },
});
