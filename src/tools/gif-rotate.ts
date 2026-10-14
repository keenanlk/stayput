import { bool, createShell, processEach, radio } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { InputError } from '../lib/input-error';
import { DamagedGif, UnreadableFile, checkGif, explain } from '../lib/gif-errors';

/**
 * Rotate and flip GIF. Each GIF is decoded, turned and rewritten in the page (see
 * src/lib/gif-compress.ts); nothing leaves the tab.
 */

createShell({
  outputFormat: () => 'gif',
  async process(files, progress) {
    const rotate = Number(radio('rotate', '90')) as 0 | 90 | 180 | 270;
    const flipH = bool('flip-h');
    const flipV = bool('flip-v');
    if (!rotate && !flipH && !flipV) throw new InputError('Choose a rotation or a flip first.');
    const { compressGif, gifFrameCount } = await import('../lib/gif-compress');
    return processEach(files, progress, 'Rotating', async (entry, index) => {
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
        transform: { rotate, flipH, flipV },
        force: true,
        onProgress: (f) => progress.set(`Rotating ${entry.file.name}: ${Math.round(f * 100)}%`, share(f)),
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
      const notes = [`${r.width}×${r.height}`, `${r.framesOut} frames`];
      const tag = [rotate ? `rotated-${rotate}` : '', flipH ? 'flipped-h' : '', flipV ? 'flipped-v' : ''].filter(Boolean).join('-');
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
