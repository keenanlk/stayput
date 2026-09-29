import { bindRange, createShell, num, processEach, radio, str } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { blurBackground, coverage, cutout, findSubject } from '../lib/background';

const colorField = document.getElementById('bg-color-field')!;
const strengthField = document.getElementById('strength-field')!;
bindRange('strength', 'strength-out');
const format = document.getElementById('format') as HTMLSelectElement;
const jpg = format.querySelector<HTMLOptionElement>('option[value="image/jpeg"]')!;

// JPG has no transparency, so it is only offered once there is a background to fill.
const sync = () => {
  const bg = radio('bg', 'transparent');
  colorField.hidden = bg !== 'color';
  strengthField.hidden = bg !== 'blur';
  jpg.disabled = bg === 'transparent';
  if (jpg.disabled && format.value === 'image/jpeg') format.value = 'image/png';
};
document.querySelectorAll<HTMLInputElement>('input[name="bg"]').forEach((i) => i.addEventListener('change', sync));
sync();

function background(): string | undefined {
  const bg = radio('bg', 'transparent');
  if (bg === 'white') return '#ffffff';
  if (bg === 'color') return str('bg-color', '#ffffff');
  return undefined;
}

createShell({
  async process(files, progress) {
    const fill = background();
    const blurred = radio('bg', 'transparent') === 'blur';
    const strength = num('strength', 5);
    const type = str('format', 'image/png') as EncodeType;
    return processEach(files, progress, blurred ? 'Blurring the background of' : 'Removing the background from', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const { bitmap } = await decodeImage(entry.file);
      try {
        progress.set(`Finding the subject in ${entry.file.name}…`, share(0.1));
        const mask = await findSubject(bitmap, (f) =>
          progress.set(`Downloading the cut-out model (one time, about 46 MB): ${Math.round(f * 100)}%`, share(0.1 * f)),
          Number(radio('keep', '0')),
        );
        if (coverage(mask) < 0.005) throw new Error('No subject was found in this photo. It works best on a clear person, animal or object against its background.');
        progress.set(`Saving ${entry.file.name}…`, share(0.9));
        const canvas = blurred ? blurBackground(bitmap, mask, strength) : cutout(bitmap, mask, { background: fill });
        const blob = await canvasToBlob(canvas, type, type === 'image/png' ? undefined : 0.92);
        if (blob.type !== type) throw new Error(`This browser cannot save ${type.replace('image/', '').toUpperCase()} images. Choose PNG.`);
        const preview = await createImageBitmap(canvas);
        const out: OutputFile = {
          name: suffixName(entry.file.name, blurred ? '-blurred-bg' : '-no-bg', extForType(type)),
          blob,
          previewUrl: await thumbnail(preview),
          note: `${bitmap.width}×${bitmap.height}`,
        };
        preview.close();
        return out;
      } finally {
        bitmap.close();
      }
    });
  },
});
