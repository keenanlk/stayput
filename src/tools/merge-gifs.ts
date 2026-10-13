import { createShell } from '../lib/shell';
import type { OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { InputError } from '../lib/input-error';
import { UnreadableFile, checkGif, explain, gifSize, MEMORY_BUDGET, GifTooLarge } from '../lib/gif-errors';

/**
 * Merge GIFs. The frames of every GIF are joined in the order listed into one
 * GIF the size of the first (see src/lib/gif-compress.ts, which draws each
 * GIF on a canvas of its own and fits it inside that size). Nothing leaves
 * the tab.
 */

const TOO_LARGE = 'Try a desktop browser, or merge fewer GIFs and run it again.';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

createShell({
  outputFormat: () => 'gif',
  async process(files, progress) {
    if (files.length < 2) throw new InputError('Add at least two GIFs to merge.');
    const { compressGif, gifFrameCount } = await import('../lib/gif-compress');
    const buffers: ArrayBuffer[] = [];
    let frames = 0;
    for (const [i, entry] of files.entries()) {
      progress.set(`Reading ${entry.file.name} (${i + 1} of ${files.length})`, (i / files.length) * 0.1);
      const buffer = await entry.file.arrayBuffer().catch(() => {
        throw new UnreadableFile();
      });
      checkGif(new Uint8Array(buffer), undefined, 1, 1);
      buffers.push(buffer);
    }
    const first = gifSize(new Uint8Array(buffers[0]!))!;
    for (const buffer of buffers) {
      try {
        frames += gifFrameCount(buffer);
      } catch (e) {
        throw explain(e, TOO_LARGE);
      }
    }
    // Every frame of the result is held whole at the first GIF's size.
    if (first.width * first.height * 4 * frames > MEMORY_BUDGET) throw new GifTooLarge(TOO_LARGE);

    const cover = $<HTMLSelectElement>('fit').value === 'cover';
    const transparent = $<HTMLInputElement>('transparent').checked;
    const r = await compressGif(buffers[0]!, {
      level: 'light',
      scale: 1,
      keepEvery: 1,
      box: { width: first.width, height: first.height, fit: cover ? 'cover' : 'contain' },
      append: buffers.slice(1),
      fill: transparent ? undefined : $<HTMLInputElement>('bars').value || '#ffffff',
      force: true,
      onProgress: (f) => progress.set(`Merging: ${Math.round(f * 100)}%`, 0.1 + 0.9 * f),
    }).catch((e) => {
      throw explain(e, TOO_LARGE);
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
    const out: OutputFile = {
      name: 'merged.gif',
      blob,
      originalSize: files.reduce((n, f) => n + f.file.size, 0),
      previewUrl,
      note: `${r.width}×${r.height}, ${r.framesOut} frames`,
    };
    return [out];
  },
  resultsTitle: () => 'Merged',
});
