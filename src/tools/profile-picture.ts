import { createShell, processEach, radio, str } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { coverage, cutout, findSubject } from '../lib/background';
import { findPortraitFaces } from '../lib/faces';
import { subjectBox } from '../lib/sticker';
import { faceFrame, renderAvatar, subjectFrame } from '../lib/avatar';

const colorInput = document.getElementById('bg-color') as HTMLInputElement | null;
// Picking a colour in the custom well selects the custom swatch.
colorInput?.addEventListener('input', () => {
  const custom = document.querySelector<HTMLInputElement>('input[name="bg"][value="custom"]');
  if (custom) custom.checked = true;
});

createShell({
  async process(files, progress) {
    const choice = radio('bg', '#f2c14e');
    const background = choice === 'custom' ? str('bg-color', '#b388eb') : choice;
    const shape = radio('shape', 'circle') as 'circle' | 'square';
    // A circle needs transparent corners, which JPG cannot hold.
    const type = (shape === 'circle' ? 'image/png' : str('format', 'image/png')) as EncodeType;
    return processEach(files, progress, 'Making a profile picture from', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const { bitmap } = await decodeImage(entry.file);
      try {
        progress.set(`Finding the subject in ${entry.file.name}…`, share(0.05));
        const faces = await findPortraitFaces(bitmap, (stage) => {
          if (stage === 'loading') progress.set('Loading the face finder (one time, about 4 MB)…', share(0.05));
        });
        const mask = await findSubject(bitmap, (f) =>
          progress.set(`Downloading the cut-out model (one time, about 46 MB): ${Math.round(f * 100)}%`, share(0.1 + 0.4 * f)),
        );
        if (coverage(mask) < 0.005) throw new Error('No person, pet or object was found in this photo. Try one with a clear subject.');
        const face = faces[0];
        const frame = face ? faceFrame(face, bitmap.height) : subjectFrame(subjectBox(mask, bitmap.width, bitmap.height)!, bitmap.height);
        const avatar = renderAvatar(cutout(bitmap, mask), frame, { size: 1024, background, shape });
        const blob = await canvasToBlob(avatar, type, type === 'image/jpeg' ? 0.92 : undefined);
        const bmp = await createImageBitmap(blob);
        const out: OutputFile = {
          name: suffixName(entry.file.name, '-profile', extForType(type)),
          blob,
          previewUrl: await thumbnail(bmp),
          note: `1024×1024, ${shape}${face ? '' : ', no face found so the whole subject is framed'}`,
        };
        bmp.close();
        return out;
      } finally {
        bitmap.close();
      }
    });
  },
});
