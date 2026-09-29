import { createShell, processEach, radio, str } from '../lib/shell';
import { canvasToBlob, decodeImage, extForType, thumbnail, type EncodeType } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { coverage, cutout, findSubject } from '../lib/background';
import { makeSticker, subjectBox } from '../lib/sticker';

const OUTLINE: Record<string, number> = { none: 0, thin: 0.018, thick: 0.04 };

createShell({
  async process(files, progress) {
    const outline = OUTLINE[radio('outline', 'thick')] ?? 0;
    const color = str('outline-color', '#ffffff');
    const square = Number(str('size', '0')) || 0;
    const type = str('format', 'image/png') as EncodeType;
    return processEach(files, progress, 'Making a sticker from', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const { bitmap } = await decodeImage(entry.file);
      try {
        progress.set(`Finding the subject in ${entry.file.name}…`, share(0.05));
        const mask = await findSubject(bitmap, (f) =>
          progress.set(`Downloading the cut-out model (one time, about 46 MB): ${Math.round(f * 100)}%`, share(0.1 * f)),
        );
        if (coverage(mask) < 0.005) throw new Error('No subject was found in this photo. Stickers work best with one clear person, pet or object.');
        const box = subjectBox(mask, bitmap.width, bitmap.height)!;
        const sticker = makeSticker(cutout(bitmap, mask), box, { outline, color, square });
        let blob = await canvasToBlob(sticker, type, type === 'image/webp' ? 0.9 : undefined);
        if (blob.type !== type) throw new Error(`This browser cannot save ${extForType(type).toUpperCase()} images.`);
        // WhatsApp refuses stickers over 100 KB; step the quality down until it fits.
        if (square && type === 'image/webp') {
          for (let q = 0.8; blob.size > 100_000 && q >= 0.4; q -= 0.1) blob = await canvasToBlob(sticker, type, q);
        }
        const bmp = await createImageBitmap(blob);
        const out: OutputFile = {
          name: suffixName(entry.file.name, '-sticker', extForType(type)),
          blob,
          previewUrl: await thumbnail(bmp),
          note: `${sticker.width}×${sticker.height}${square && type === 'image/webp' ? (blob.size <= 100_000 ? ', under WhatsApp’s 100 KB limit' : ', over WhatsApp’s 100 KB limit') : ''}`,
        };
        bmp.close();
        return out;
      } finally {
        bitmap.close();
      }
    });
  },
});
