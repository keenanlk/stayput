import { createShell, processEach, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import type { GifLevel } from '../lib/gif-compress';
import { DamagedGif, UnreadableFile, checkGif, explain } from '../lib/gif-errors';

/**
 * Compress GIF. Each GIF is decoded and rewritten in the page (see
 * src/lib/gif-compress.ts); nothing leaves the tab.
 */

createShell({
  outputFormat: () => 'gif',
  async process(files, progress) {
    const level = str('level', 'medium') as GifLevel;
    const scale = Number(str('scale', '1'));
    const keepEvery = Number(str('frames', '1'));
    const { compressGif, gifFrameCount } = await import('../lib/gif-compress');
    return processEach(files, progress, 'Compressing', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const buffer = await entry.file.arrayBuffer().catch(() => {
        throw new UnreadableFile();
      });
      const bytes = new Uint8Array(buffer);
      checkGif(bytes, () => {
        try {
          return gifFrameCount(buffer);
        } catch {
          throw new DamagedGif();
        }
      }, scale, keepEvery);
      const r = await compressGif(buffer, {
        level,
        scale,
        keepEvery,
        onProgress: (f) => progress.set(`Compressing ${entry.file.name}: ${Math.round(f * 100)}%`, share(f)),
      }).catch((e) => {
        throw explain(e);
      });
      const blob = new Blob([r.bytes], { type: 'image/gif' });
      let previewUrl: string | undefined;
      try {
        const bitmap = await createImageBitmap(blob);
        previewUrl = await thumbnail(bitmap);
        bitmap.close();
      } catch {
        // A preview is a nicety; the file itself is fine.
      }
      const notes = [`${r.width}×${r.height}`];
      if (r.unchanged) notes.push('already well compressed, original kept');
      else notes.push(r.framesOut === r.framesIn ? `${r.framesOut} frames` : `${r.framesOut} of ${r.framesIn} frames`);
      const out: OutputFile = {
        name: suffixName(entry.file.name, '-compressed', 'gif'),
        blob,
        originalSize: entry.file.size,
        previewUrl,
        note: notes.join(', '),
      };
      return out;
    });
  },
});
