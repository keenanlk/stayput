import { createShell, processEach, radio, str } from '../lib/shell';
import { canvasToBlob, decodeImage, thumbnail } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';
import { cutout, findSubject } from '../lib/background';
import { findPortraitFaces } from '../lib/faces';
import { measureHead, placement, renderPhoto, renderSheet, sizeById } from '../lib/passport';

const FILL: Record<string, string> = { keep: '#ffffff', white: '#ffffff', grey: '#e4e4e4' };

createShell({
  async process(files, progress) {
    const size = sizeById(str('size', 'us'));
    const bg = radio('bg', 'keep');
    return processEach(files, progress, 'Making a passport photo from', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const { bitmap } = await decodeImage(entry.file);
      try {
        progress.set(`Finding the face in ${entry.file.name}…`, share(0.05));
        const faces = await findPortraitFaces(bitmap, (stage) => {
          if (stage === 'loading') progress.set('Loading the face finder (one time, about 4 MB)…', share(0.05));
        });
        const face = faces[0];
        if (!face) throw new Error('No face was found. Use a photo taken straight on, with the whole face visible and well lit.');
        const second = faces[1];
        if (second && second.box.w * second.box.h > face.box.w * face.box.h * 0.2) {
          throw new Error('There is more than one person in this photo. A passport photo must show only you.');
        }
        const mask = await findSubject(bitmap, (f) =>
          progress.set(`Downloading the cut-out model (one time, about 46 MB): ${Math.round(f * 100)}%`, share(0.1 + 0.4 * f)),
        );
        progress.set(`Sizing ${entry.file.name}…`, share(0.8));
        const head = measureHead(mask, face, bitmap.width, bitmap.height);
        const source = bg === 'keep' ? bitmap : cutout(bitmap, mask);
        const photo = renderPhoto(source, head, size, FILL[bg] ?? '#ffffff');
        const { scale, W, H } = placement(head, size);
        const sheet = renderSheet(photo, size);
        const single = await canvasToBlob(photo, 'image/jpeg', 0.95);
        const print = await canvasToBlob(sheet.canvas, 'image/jpeg', 0.95);
        const preview = await createImageBitmap(photo);
        const thumb = await thumbnail(preview);
        preview.close();
        // Enlarging a small face much past its own pixels shows as softness in print.
        const soft = scale > 2 ? ', low resolution: use a closer or sharper photo if you can' : '';
        const outs: OutputFile[] = [
          { name: suffixName(entry.file.name, '-passport', 'jpg'), blob: single, previewUrl: thumb, note: `${W}×${H} px, ${size.widthMm === size.heightMm ? '2×2 in' : `${size.widthMm}×${size.heightMm} mm`}${soft}` },
          { name: suffixName(entry.file.name, '-passport-4x6-print', 'jpg'), blob: print, previewUrl: thumb, note: `${sheet.copies} copies on a 4×6 in print` },
        ];
        return outs;
      } finally {
        bitmap.close();
      }
    });
  },
});
