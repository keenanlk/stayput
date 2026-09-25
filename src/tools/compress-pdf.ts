import { createShell, bindRange, num, radio, bool } from '../lib/shell';
import { compressPdf, type CompressMode } from '../lib/pdf';
import type { OutputFile } from '../lib/files';

bindRange('quality', 'quality-out');

const modeInputs = document.querySelectorAll<HTMLInputElement>('input[name="mode"]');
const syncMode = () => {
  const mode = radio('mode', 'images');
  document.getElementById('quality-field')!.hidden = mode === 'lossless';
  document.getElementById('maxpx-field')!.hidden = mode !== 'images';
  document.getElementById('dpi-field')!.hidden = mode !== 'flatten';
  document.getElementById('gray-field')!.hidden = mode !== 'flatten';
};
modeInputs.forEach((i) => i.addEventListener('change', syncMode));
syncMode();

createShell({
  async process(files, progress) {
    const mode = radio('mode', 'images') as CompressMode;
    const opts = {
      mode,
      quality: num('quality', 70) / 100,
      maxImagePx: num('maxpx', 1600),
      flattenDpi: num('dpi', 110),
      grayscale: bool('grayscale'),
    };
    const outs: OutputFile[] = [];
    for (const [i, entry] of files.entries()) {
      progress.set(`Compressing ${entry.file.name} (${i + 1} of ${files.length})`, i / files.length);
      const src = new Uint8Array(await entry.file.arrayBuffer());
      const { bytes, stats } = await compressPdf(src, opts, (msg) => progress.set(`${entry.file.name}: ${msg}`, i / files.length));
      // Never hand back a bigger file than the original.
      const grew = bytes.length >= src.length;
      const note =
        mode === 'images'
          ? `${stats.imagesRecompressed} of ${stats.imagesSeen} images recompressed${grew ? ', original kept' : ''}`
          : mode === 'flatten'
            ? `pages flattened at ${opts.flattenDpi} DPI`
            : grew
              ? 'already compact, original kept'
              : 'structure rewritten';
      outs.push({
        name: entry.file.name,
        blob: new Blob([(grew && mode !== 'flatten' ? src : bytes) as BlobPart], { type: 'application/pdf' }),
        originalSize: entry.file.size,
        note,
      });
    }
    progress.set('Done', 1);
    return outs;
  },
});
