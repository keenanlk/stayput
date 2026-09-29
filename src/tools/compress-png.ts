import { createShell, processEach, str } from '../lib/shell';
import { sleepFrame, suffixName, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { compressPng } from '../lib/png-compress';

/**
 * Compress PNG. Each file is decoded and re-encoded in the page (see
 * src/lib/png-compress.ts); nothing leaves the tab.
 */

createShell({
  outputFormat: () => 'png',
  async process(files, progress) {
    const colors = Number(str('colors', '256'));
    return processEach(files, progress, 'Compressing', async (entry) => {
      // Let the progress text paint before the encoder takes the thread.
      await sleepFrame();
      const r = compressPng(await entry.file.arrayBuffer(), colors);
      const blob = new Blob([r.bytes], { type: 'image/png' });
      let previewUrl: string | undefined;
      try {
        const bitmap = await createImageBitmap(blob);
        previewUrl = await thumbnail(bitmap);
        bitmap.close();
      } catch {
        // A preview is a nicety; the file itself is fine.
      }
      const notes = [`${r.width}×${r.height}`];
      if (r.frames > 1) notes.push(`${r.frames} frames`);
      notes.push(r.keptOriginal ? 'already well compressed, original kept' : colors ? `${colors} colours` : 'lossless');
      const out: OutputFile = {
        name: suffixName(entry.file.name, '-compressed', 'png'),
        blob,
        originalSize: entry.file.size,
        previewUrl,
        note: notes.join(', '),
      };
      return out;
    });
  },
});
