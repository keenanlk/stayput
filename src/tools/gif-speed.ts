import { bool, createShell, processEach, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { DamagedGif, UnreadableFile, checkGif, explain } from '../lib/gif-errors';

/**
 * GIF speed and reverse. Each GIF is decoded, re-timed and rewritten in the page (see
 * src/lib/gif-compress.ts); nothing leaves the tab.
 */

createShell({
  outputFormat: () => 'gif',
  async process(files, progress) {
    const speed = Number(str('speed', '2'));
    const reverse = bool('reverse');
    const { compressGif, gifFrameCount } = await import('../lib/gif-compress');
    return processEach(files, progress, 'Changing', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const buffer = await entry.file.arrayBuffer().catch(() => {
        throw new UnreadableFile();
      });
      const bytes = new Uint8Array(buffer);
      checkGif(
        bytes,
        () => {
          try {
            return gifFrameCount(buffer);
          } catch {
            throw new DamagedGif();
          }
        },
        1,
        1,
      );
      const r = await compressGif(buffer, {
        level: 'light',
        scale: 1,
        keepEvery: 1,
        speed,
        reverse,
        force: true,
        onProgress: (f) => progress.set(`Changing ${entry.file.name}: ${Math.round(f * 100)}%`, share(f)),
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
      const notes: string[] = [];
      if (reverse) notes.push('backwards');
      if (speed !== 1) notes.push(`${speed}× speed`);
      notes.push(`${r.framesOut} frames`);
      const tag = [reverse ? 'reversed' : '', speed !== 1 ? `${String(speed).replace('.', '_')}x` : ''].filter(Boolean).join('-') || 'copy';
      const out: OutputFile = {
        name: suffixName(entry.file.name, `-${tag}`, 'gif'),
        blob,
        originalSize: entry.file.size,
        previewUrl,
        note: notes.join(', '),
      };
      return out;
    });
  },
});
