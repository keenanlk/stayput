import { createShell, bindRange, num, str, radio, processEach } from '../lib/shell';
import { canvasToBlob, decodeImage, drawExact, drawScaled, extForType, fitSize, supportsWebpEncoding, thumbnail, type EncodeType, type Fit } from '../lib/image';
import { replaceExt, type OutputFile } from '../lib/files';
import { fitBytes } from '../lib/fit-bytes';

bindRange('quality', 'quality-out');
bindRange('percent', 'percent-out', (v) => `${v}%`);

void supportsWebpEncoding().then((ok) => {
  if (ok) return;
  const opt = document.querySelector<HTMLOptionElement>('#format option[value="image/webp"]');
  if (opt) opt.disabled = true;
});

const syncMode = () => {
  const mode = radio('resize-mode', 'max');
  document.getElementById('max-fields')!.hidden = mode !== 'max';
  document.getElementById('exact-fields')!.hidden = mode !== 'exact';
  document.getElementById('percent-field')!.hidden = mode !== 'percent';
  const aim = radio('aim', 'quality');
  document.getElementById('quality-field')!.hidden = aim !== 'quality';
  document.getElementById('target-field')!.hidden = aim !== 'size';
};
document.querySelectorAll<HTMLInputElement>('input[name="resize-mode"], input[name="aim"]').forEach((i) => i.addEventListener('change', syncMode));
syncMode();

function targetType(file: File, choice: string, fitting: boolean): EncodeType {
  if (choice !== 'keep') return choice as EncodeType;
  if (file.type === 'image/webp') return 'image/webp';
  // A PNG has no quality setting, so fitting a size keeps it only if shrinking alone gets there; JPG is the usual ask.
  if (file.type === 'image/png' && !fitting) return 'image/png';
  return 'image/jpeg';
}

createShell({
  async process(files, progress) {
    const mode = radio('resize-mode', 'max');
    const maxWidth = mode === 'max' ? num('max-width', 0) : 0;
    const maxHeight = mode === 'max' ? num('max-height', 0) : 0;
    const scale = mode === 'percent' ? num('percent', 100) / 100 : 1;
    const exactW = Math.min(10000, Math.max(1, Math.round(num('exact-width', 1920))));
    const exactH = Math.min(10000, Math.max(1, Math.round(num('exact-height', 1080))));
    const fit = str('fit', 'cover') as Fit;
    const quality = num('quality', 80) / 100;
    const choice = str('format', 'keep');
    const fitting = radio('aim', 'quality') === 'size';
    const limit = Math.max(1, num('target-size', 100)) * (str('target-unit', 'KB') === 'MB' ? 1e6 : 1e3);
    const limitLabel = `${num('target-size', 100)} ${str('target-unit', 'KB')}`;
    return processEach(files, progress, 'Compressing', async (entry) => {
      const decoded = await decodeImage(entry.file);
      try {
        const type = targetType(entry.file, choice, fitting);
        const background = type === 'image/jpeg' ? '#ffffff' : undefined;
        const exact = mode === 'exact';
        const size = exact ? { width: exactW, height: exactH } : fitSize(decoded.width, decoded.height, { maxWidth, maxHeight, scale });
        const exactCanvas = exact ? await drawExact(decoded.bitmap, exactW, exactH, fit, background) : undefined;
        const draw = (w: number, h: number) => exactCanvas ?? drawScaled(decoded.bitmap, w, h, background);
        const notes: string[] = [];
        let blob: Blob;
        let width = size.width;
        let height = size.height;
        if (fitting) {
          // An exact size is a requirement too, so only shrink when no exact size was asked for.
          const r = await fitBytes(draw, size.width, size.height, type, limit, !exact);
          blob = r.blob;
          width = r.width;
          height = r.height;
          if (!r.fits) notes.push(exact ? `could not get under ${limitLabel} at this size; try a smaller size or WebP` : `could not get under ${limitLabel}`);
          else if (width < size.width) notes.push(`made smaller to fit under ${limitLabel}`);
          else notes.push(`under ${limitLabel}${r.quality !== undefined ? ` at quality ${Math.round(r.quality * 100)}` : ''}`);
        } else {
          blob = await canvasToBlob(draw(width, height), type, type === 'image/png' ? undefined : quality);
          if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
        }
        if (exact && (exactW > decoded.width * 1.5 || exactH > decoded.height * 1.5)) notes.push('enlarged; the AI upscaler gives a sharper result');
        const out: OutputFile = {
          name: replaceExt(entry.file.name, extForType(type)),
          blob,
          originalSize: entry.file.size,
          previewUrl: await thumbnail(decoded.bitmap),
          note: [`${width}×${height}`, ...notes].join(', '),
        };
        return out;
      } finally {
        decoded.bitmap.close();
      }
    });
  },
});

