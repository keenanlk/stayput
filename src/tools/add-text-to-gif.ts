import { createShell, processEach } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { drawText, loadFont } from '../lib/image-text';
import { createTextStage } from '../lib/text-stage';
import { InputError } from '../lib/input-error';
import { DamagedGif, UnreadableFile, checkGif, explain } from '../lib/gif-errors';
import { firstFrame } from '../lib/gif-preview';

/**
 * Add text to GIF. The first frame is the backdrop of the preview, where the
 * text is dragged into place. Every frame is then composited and rewritten by
 * src/lib/gif-compress.ts with the text drawn on it, loaded on demand. The
 * rewrite is forced, so the download always carries the text even when it comes
 * out larger than the original. Nothing leaves the tab.
 */

const TOO_LARGE = 'Try a desktop browser, or a smaller GIF.';

const stage = createTextStage();

const shell = createShell({
  outputFormat: () => 'gif',
  async onFilesChanged(files) {
    if (files.length === 0) return stage.show(undefined);
    try {
      const buffer = await files[0]!.file.arrayBuffer().catch(() => {
        throw new UnreadableFile();
      });
      const { source } = await firstFrame(buffer, new Uint8Array(buffer));
      const bitmap = 'close' in source ? (source as ImageBitmap) : await createImageBitmap(source);
      stage.show(bitmap, 'Drag the text on the picture to move it. The same text goes on every frame.');
    } catch (e) {
      stage.show(undefined);
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const list = stage.blocks();
    if (!list.some((b) => b.text.trim())) throw new InputError('Type some text first; the GIF would come out unchanged.');
    const s = stage.style();
    await loadFont(s.font);
    const { compressGif, gifFrameCount } = await import('../lib/gif-compress');
    return processEach(files, progress, 'Adding text to', async (entry) => {
      const buffer = await entry.file.arrayBuffer().catch(() => {
        throw new UnreadableFile();
      });
      checkGif(
        new Uint8Array(buffer),
        () => {
          try {
            return gifFrameCount(buffer);
          } catch {
            throw new DamagedGif();
          }
        },
        1,
        1,
        undefined,
        TOO_LARGE,
      );
      const r = await compressGif(buffer, {
        level: 'light',
        scale: 1,
        keepEvery: 1,
        force: true,
        overlay: (ctx, w, h) => {
          drawText(ctx, w, h, list, s);
        },
        onProgress: (f) => progress.set(`Adding text to ${entry.file.name}: ${Math.round(f * 100)}%`, f),
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
      const frames = r.framesOut === r.framesIn ? `${r.framesOut} frames` : `${r.framesOut} of ${r.framesIn} frames`;
      const out: OutputFile = {
        name: suffixName(entry.file.name, '-text', 'gif'),
        blob,
        originalSize: entry.file.size,
        previewUrl,
        note: `${r.width}×${r.height}, ${frames}, text added`,
      };
      return out;
    });
  },
});
