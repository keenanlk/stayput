import { createShell, processEach } from '../lib/shell';
import { baseName, type OutputFile } from '../lib/files';
import { canvasToBlob, thumbnail } from '../lib/image';
import { DamagedGif, UnreadableFile, checkGif, explain } from '../lib/gif-errors';

/**
 * GIF frame splitter. Each GIF is decoded frame by frame in the page (see src/lib/gif-compress.ts)
 * and every frame is saved as a PNG; nothing leaves the tab.
 */

let summary = '';

createShell({
  outputFormat: () => 'png',
  resultsTitle: (outs) => (summary || (outs.length === 1 ? 'Done: 1 frame' : `Done: ${outs.length} files`)),
  async process(files, progress) {
    const { eachGifFrame, gifFrameCount } = await import('../lib/gif-compress');
    summary = '';
    const results = await processEach(files, progress, 'Splitting', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const buffer = await entry.file.arrayBuffer().catch(() => {
        throw new UnreadableFile();
      });
      let frames = 0;
      checkGif(
        new Uint8Array(buffer),
        () => {
          try {
            frames = gifFrameCount(buffer);
            return frames;
          } catch {
            throw new DamagedGif();
          }
        },
        1,
        1,
      );
      const pad = Math.max(3, String(frames).length);
      const prefix = files.length > 1 ? `${baseName(entry.file.name)}-` : '';
      const outs: OutputFile[] = [];
      let total = 0;
      await eachGifFrame(buffer, async (screen, info) => {
        const blob = await canvasToBlob(screen, 'image/png');
        const bitmap = await createImageBitmap(screen);
        const previewUrl = await thumbnail(bitmap);
        bitmap.close();
        total += info.delay;
        outs.push({
          name: `${prefix}frame-${String(info.index + 1).padStart(pad, '0')}.png`,
          blob,
          previewUrl,
          note: `frame ${info.index + 1} of ${info.total}, ${info.delay} ms`,
        });
        progress.set(`Splitting ${entry.file.name}: frame ${info.index + 1} of ${info.total}`, share((info.index + 1) / info.total));
      }).catch((e) => {
        throw explain(e);
      });
      if (files.length === 1) summary = `${outs.length} frames · ${(total / 1000).toFixed(2)} s in total`;
      return outs;
    });
    return results;
  },
});
