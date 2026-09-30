import { createShell, bindRange, num, str, radio, bool, processEach } from '../lib/shell';
import { compressPdf, type CompressMode, type CompressOptions } from '../lib/pdf';
import { formatBytes, type OutputFile } from '../lib/files';

bindRange('quality', 'quality-out');

const modeInputs = document.querySelectorAll<HTMLInputElement>('input[name="mode"]');
const syncMode = () => {
  const mode = radio('mode', 'images');
  document.getElementById('quality-field')!.hidden = mode === 'lossless' || mode === 'size';
  document.getElementById('maxpx-field')!.hidden = mode !== 'images';
  document.getElementById('dpi-field')!.hidden = mode !== 'flatten';
  document.getElementById('gray-field')!.hidden = mode !== 'flatten';
  document.getElementById('target-field')!.hidden = mode !== 'size';
};
modeInputs.forEach((i) => i.addEventListener('change', syncMode));
syncMode();

/**
 * The settings tried, gentlest first, when fitting a file size: a lossless
 * rewrite, then lighter to heavier image recompression (text stays text), and
 * only then pages flattened to pictures at falling resolutions.
 */
const LADDER: { opts: CompressOptions; label: string }[] = [
  { opts: { mode: 'lossless', quality: 0.8, maxImagePx: 0, flattenDpi: 110 }, label: 'lossless cleanup' },
  { opts: { mode: 'images', quality: 0.75, maxImagePx: 2400, flattenDpi: 110 }, label: 'images at quality 75' },
  { opts: { mode: 'images', quality: 0.6, maxImagePx: 1600, flattenDpi: 110 }, label: 'images at quality 60, 1600 px' },
  { opts: { mode: 'images', quality: 0.45, maxImagePx: 1200, flattenDpi: 110 }, label: 'images at quality 45, 1200 px' },
  { opts: { mode: 'images', quality: 0.3, maxImagePx: 900, flattenDpi: 110 }, label: 'images at quality 30, 900 px' },
  { opts: { mode: 'flatten', quality: 0.6, maxImagePx: 0, flattenDpi: 150 }, label: 'pages flattened at 150 DPI' },
  { opts: { mode: 'flatten', quality: 0.5, maxImagePx: 0, flattenDpi: 110 }, label: 'pages flattened at 110 DPI' },
  { opts: { mode: 'flatten', quality: 0.45, maxImagePx: 0, flattenDpi: 90 }, label: 'pages flattened at 90 DPI' },
  { opts: { mode: 'flatten', quality: 0.4, maxImagePx: 0, flattenDpi: 72, grayscale: true }, label: 'pages flattened at 72 DPI in grayscale' },
  { opts: { mode: 'flatten', quality: 0.3, maxImagePx: 0, flattenDpi: 60, grayscale: true }, label: 'pages flattened at 60 DPI in grayscale' },
];

createShell({
  async process(files, progress) {
    const mode = radio('mode', 'images') as CompressMode | 'size';
    const limit = Math.max(1, num('target-size', 1)) * (str('target-unit', 'MB') === 'MB' ? 1e6 : 1e3);
    const limitLabel = `${num('target-size', 1)} ${str('target-unit', 'MB')}`;
    return processEach(files, progress, 'Compressing', async (entry, i) => {
      const src = new Uint8Array(await entry.file.arrayBuffer());
      const status = (msg: string) => progress.set(`${entry.file.name}: ${msg}`, i / files.length);
      if (mode === 'size') {
        if (src.length <= limit) {
          return { name: entry.file.name, blob: new Blob([src as BlobPart], { type: 'application/pdf' }), originalSize: entry.file.size, note: `already under ${limitLabel}, original kept` } satisfies OutputFile;
        }
        let best: { bytes: Uint8Array; label: string } | undefined;
        for (const step of LADDER) {
          status(`trying ${step.label}`);
          const { bytes } = await compressPdf(src, step.opts, status);
          if (!best || bytes.length < best.bytes.length) best = { bytes, label: step.label };
          if (bytes.length <= limit) break;
        }
        const fits = best!.bytes.length <= limit;
        const note = fits
          ? `under ${limitLabel}: ${best!.label}`
          : `could not get under ${limitLabel}; smallest was ${formatBytes(best!.bytes.length)} (${best!.label}). Try splitting it into parts`;
        return { name: entry.file.name, blob: new Blob([best!.bytes as BlobPart], { type: 'application/pdf' }), originalSize: entry.file.size, note } satisfies OutputFile;
      }
      const opts = {
        mode,
        quality: num('quality', 70) / 100,
        maxImagePx: num('maxpx', 1600),
        flattenDpi: num('dpi', 110),
        grayscale: bool('grayscale'),
      };
      const { bytes, stats } = await compressPdf(src, opts, status);
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
      const out: OutputFile = {
        name: entry.file.name,
        blob: new Blob([(grew && mode !== 'flatten' ? src : bytes) as BlobPart], { type: 'application/pdf' }),
        originalSize: entry.file.size,
        note,
      };
      return out;
    });
  },
});
