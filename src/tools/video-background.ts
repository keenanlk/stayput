import { bindRange, createShell, num, radio, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { describeEdit } from './video-edit-shell';

/**
 * Video background remover: the people in each frame are found by MediaPipe's
 * selfie segmenter (src/lib/person-mask.ts) and everything else is blurred or
 * replaced with a colour or a picture, then the video is encoded again
 * (src/lib/video-edit.ts). Nothing leaves the tab.
 */

type Kind = 'blur' | 'color' | 'image';
const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(f.name);

const kind = () => radio('bg', 'blur') as Kind;
const sync = () => {
  document.getElementById('strength-field')!.hidden = kind() !== 'blur';
  document.getElementById('color-field')!.hidden = kind() !== 'color';
  document.getElementById('image-hint')!.hidden = kind() !== 'image';
};
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="bg"]')) r.addEventListener('change', sync);
bindRange('strength', 'strength-out');
sync();

/** Draw `img` to cover the whole canvas, cropping what does not fit. */
function cover(ctx: CanvasRenderingContext2D, img: ImageBitmap) {
  const { width, height } = ctx.canvas;
  const k = Math.max(width / img.width, height / img.height);
  const w = img.width * k;
  const h = img.height * k;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}

createShell({
  outputFormat: () => 'mp4',
  async process(files, progress) {
    const pictures = files.filter((f) => isImage(f.file));
    const videos = files.filter((f) => !isImage(f.file));
    if (videos.length === 0) throw new Error('Add a video too: the picture is only the new background.');
    if (pictures.length > 1) throw new Error('Add one picture for the background, with the videos to put it behind.');
    let bgKind = kind();
    if (pictures.length === 1) bgKind = 'image';
    else if (bgKind === 'image') throw new Error('Add a picture with the video to use as the new background, or choose Blur or Colour.');
    const strength = num('strength', 6);
    const color = str('bg-color', '#00b140');
    const picture = pictures[0] ? await createImageBitmap(pictures[0].file) : undefined;

    progress.set('Loading the person finder, once (16 MB)…', 0.01);
    const { Matte, loadPersonMask } = await import('../lib/person-mask');
    await loadPersonMask();
    const { editVideo } = await import('../lib/video-edit');
    const outputs: OutputFile[] = [];
    for (const [index, entry] of videos.entries()) {
      const file = entry.file;
      const share = (f: number) => (index + f) / videos.length;
      const matte = new Matte();
      const r = await editVideo(file, {
        async paint(ctx) {
          await matte.apply(ctx, (c, frame) => {
            if (bgKind === 'color') {
              c.fillStyle = color;
              c.fillRect(0, 0, c.canvas.width, c.canvas.height);
            } else if (bgKind === 'image') cover(c, picture!);
            else {
              const { width, height } = c.canvas;
              const radius = Math.max(2, Math.round((Math.min(width, height) * strength) / 250));
              c.filter = `blur(${radius}px)`;
              // Drawn a little larger, so the blur does not pull dark edges in from outside the frame.
              c.drawImage(frame, -2 * radius, -2 * radius, width + 4 * radius, height + 4 * radius);
              c.filter = 'none';
            }
          });
        },
        onProgress: (f) => progress.set(`Replacing the background of ${file.name}: ${Math.round(f * 100)}%`, share(0.03 + f * 0.97)),
      });
      const found = matte.frames ? matte.framesWithPerson / matte.frames : 0;
      const what = bgKind === 'blur' ? 'background blurred' : bgKind === 'color' ? `background ${color}` : `background from ${pictures[0]!.file.name}`;
      outputs.push({
        name: suffixName(file.name, bgKind === 'blur' ? '-blurred-background' : '-new-background', r.ext),
        blob: r.blob,
        originalSize: file.size,
        note: `${describeEdit(r)}, ${what}, ${found < 0.05 ? 'no person found, so the whole picture was treated as background' : `a person in ${Math.round(found * 100)}% of frames`}`,
      });
    }
    return outputs;
  },
});
