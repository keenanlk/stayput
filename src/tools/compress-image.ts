import { createShell, bindRange, num, str, radio, processEach } from '../lib/shell';
import { decodeImage, encodeBitmap, extForType, fitSize, supportsWebpEncoding, thumbnail, type EncodeType } from '../lib/image';
import { replaceExt, type OutputFile } from '../lib/files';

bindRange('quality', 'quality-out');
bindRange('percent', 'percent-out', (v) => `${v}%`);

void supportsWebpEncoding().then((ok) => {
  if (ok) return;
  const opt = document.querySelector<HTMLOptionElement>('#format option[value="image/webp"]');
  if (opt) opt.disabled = true;
});

const modeInputs = document.querySelectorAll<HTMLInputElement>('input[name="resize-mode"]');
const syncMode = () => {
  const mode = radio('resize-mode', 'max');
  document.getElementById('max-fields')!.hidden = mode !== 'max';
  document.getElementById('percent-field')!.hidden = mode !== 'percent';
};
modeInputs.forEach((i) => i.addEventListener('change', syncMode));
syncMode();

function targetType(file: File, choice: string): EncodeType {
  if (choice !== 'keep') return choice as EncodeType;
  if (file.type === 'image/png') return 'image/png';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

createShell({
  async process(files, progress) {
    const mode = radio('resize-mode', 'max');
    const maxWidth = mode === 'max' ? num('max-width', 0) : 0;
    const maxHeight = mode === 'max' ? num('max-height', 0) : 0;
    const scale = mode === 'percent' ? num('percent', 100) / 100 : 1;
    const quality = num('quality', 80) / 100;
    const choice = str('format', 'keep');
    return processEach(files, progress, 'Compressing', async (entry) => {
      const decoded = await decodeImage(entry.file);
      const type = targetType(entry.file, choice);
      const size = fitSize(decoded.width, decoded.height, { maxWidth, maxHeight, scale });
      const blob = await encodeBitmap(decoded.bitmap, { type, quality, ...size });
      const out: OutputFile = {
        name: replaceExt(entry.file.name, extForType(type)),
        blob,
        originalSize: entry.file.size,
        previewUrl: await thumbnail(decoded.bitmap),
        note: `${size.width}×${size.height}`,
      };
      decoded.bitmap.close();
      return out;
    });
  },
});
