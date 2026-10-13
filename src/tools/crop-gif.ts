import { createShell, processEach, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { cropBox } from '../lib/crop-box';
import { InputError } from '../lib/input-error';
import { DamagedGif, UnreadableFile, checkGif, explain, gifSize } from '../lib/gif-errors';
import { firstFrame } from '../lib/gif-preview';
import type { GifLevel } from '../lib/gif-compress';

/**
 * Crop GIF. The first frame is shown on the crop stage so the box can be
 * drawn; every frame is then cropped to it by src/lib/gif-compress.ts, loaded
 * on demand. Box coordinates are in the GIF's own logical-screen pixels.
 * Nothing leaves the tab.
 */

const TOO_LARGE = 'Try a desktop browser, or crop to a smaller area and run it again.';

function unload() {
  cropBox.hide();
}

async function load(file: File) {
  unload();
  const buffer = await file.arrayBuffer().catch(() => {
    throw new UnreadableFile();
  });
  const { source, width, height } = await firstFrame(buffer, new Uint8Array(buffer));
  cropBox.show(source, width, height);
  if ('close' in source) source.close();
}

const shell = createShell({
  outputFormat: () => 'gif',
  async onFilesChanged(files) {
    if (files.length === 0) return unload();
    try {
      await load(files[0]!.file);
    } catch (e) {
      unload();
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const { compressGif, gifFrameCount } = await import('../lib/gif-compress');
    return processEach(files, progress, 'Cropping', async (entry) => {
      const buffer = await entry.file.arrayBuffer().catch(() => {
        throw new UnreadableFile();
      });
      const bytes = new Uint8Array(buffer);
      checkGif(bytes, undefined, 1, 1);
      const size = gifSize(bytes)!;
      if (cropBox.size().width !== size.width || cropBox.size().height !== size.height) await load(entry.file);
      const r = cropBox.rect();
      if (r.x === 0 && r.y === 0 && r.w === size.width && r.h === size.height) {
        throw new InputError('The crop box covers the whole picture. Drag its edges or pick a shape first.');
      }
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
        { width: r.w, height: r.h },
        TOO_LARGE,
      );
      const out = await compressGif(buffer, {
        level: str('colours', 'light') as GifLevel,
        scale: 1,
        keepEvery: 1,
        crop: { x: r.x, y: r.y, width: r.w, height: r.h },
        force: true,
        onProgress: (f) => progress.set(`Cropping ${entry.file.name}: ${Math.round(f * 100)}%`, f),
      }).catch((e) => {
        throw explain(e, TOO_LARGE);
      });
      const blob = new Blob([out.bytes], { type: 'image/gif' });
      let previewUrl: string | undefined;
      try {
        const bitmap = await createImageBitmap(blob);
        previewUrl = await thumbnail(bitmap);
        bitmap.close();
      } catch {
        // A preview is a nicety; the file itself is fine.
      }
      const file: OutputFile = {
        name: suffixName(entry.file.name, '-cropped', 'gif'),
        blob,
        originalSize: entry.file.size,
        previewUrl,
        note: `${out.width}×${out.height}, ${out.framesOut} frames`,
      };
      return file;
    });
  },
});
