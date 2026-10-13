import { bindRange, createShell, num, radio, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { EncoderUnavailable, hasVideoEncoder, requireH264Encoder } from '../lib/encoder-probe';
import { describeEdit } from './video-edit-shell';
import { InputError } from '../lib/input-error';
import { blur as boxBlur } from '../lib/blur';
import { TimeLeft } from '../lib/time-left';
import { isPhoneBrowser, PHONE_SAFE_BYTES } from '../lib/phone-limit';

/**
 * Video background remover: the people in each frame are found by MediaPipe's
 * selfie segmenter (src/lib/person-mask.ts) and everything else is blurred or
 * replaced with a colour or a picture, then the video is encoded again
 * (src/lib/video-edit.ts). Nothing leaves the tab.
 */

type Kind = 'blur' | 'color' | 'image';
const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(f.name);

const kind = () => radio('bg', 'blur') as Kind;
const finder = () => radio('finder', 'edges') as 'fast' | 'edges';
const sync = () => {
  document.getElementById('strength-field')!.hidden = kind() !== 'blur';
  document.getElementById('color-field')!.hidden = kind() !== 'color';
  document.getElementById('image-hint')!.hidden = kind() !== 'image';
};
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="bg"]')) r.addEventListener('change', sync);
bindRange('strength', 'strength-out');
sync();

/** Longest side the blurred background is made at; it is scaled up afterwards, which also softens it. */
const BLUR_WORK = 480;

/**
 * Draw `frame` blurred over the whole canvas. Done by hand on a small copy, not with the canvas `filter` property:
 * Safari has no such property, and there the "blur" was a no-op that left the whole background sharp.
 */
function drawBlurred(ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, small: HTMLCanvasElement, strength: number) {
  const { width, height } = ctx.canvas;
  // Same strength as before: a Gaussian of about min side x strength / 250 pixels, here measured on the small copy.
  const k = Math.min(1, BLUR_WORK / Math.max(width, height));
  small.width = Math.max(2, Math.round(width * k));
  small.height = Math.max(2, Math.round(height * k));
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(frame, 0, 0, small.width, small.height);
  const sigma = Math.max(2, (Math.min(width, height) * strength) / 250) * k;
  // boxBlur's radius is twice the Gaussian's spread; it reads clamped edges, so no dark border is pulled in.
  boxBlur(sctx, { x: 0, y: 0, w: small.width, h: small.height }, Math.max(2, Math.round(sigma * 2)));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, width, height);
}

/** Draw `img` to cover the whole canvas, cropping what does not fit. */
function cover(ctx: CanvasRenderingContext2D, img: ImageBitmap) {
  const { width, height } = ctx.canvas;
  const k = Math.max(width / img.width, height / img.height);
  const w = img.width * k;
  const h = img.height * k;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}

/** Longest side of a clip a phone handles comfortably: 1080p. Bigger ones are slow and more likely to run out of memory. */
const PHONE_SAFE_SIDE = 1920;
const phoneNote = document.getElementById('phone-note');
let phoneCheck = 0;

/** On a phone, a long or 4K clip gets a one-line suggestion. Never blocks the run. */
async function checkPhoneClip(files: { file: File }[]) {
  if (!phoneNote) return;
  const mine = ++phoneCheck;
  phoneNote.hidden = true;
  if (!isPhoneBrowser()) return;
  const videos = files.map((f) => f.file).filter((f) => !isImage(f));
  let big = videos.some((f) => f.size > PHONE_SAFE_BYTES);
  if (!big && videos.length > 0) {
    const { videoSize } = await import('../lib/video-edit');
    for (const f of videos) {
      const s = await videoSize(f).catch(() => undefined);
      if (s && Math.max(s.width, s.height) > PHONE_SAFE_SIDE) big = true;
    }
  }
  if (mine === phoneCheck) phoneNote.hidden = !big;
}

createShell({
  onFilesChanged: checkPhoneClip,
  keepAwake: true,
  outputFormat: () => 'mp4',
  async process(files, progress) {
    const pictures = files.filter((f) => isImage(f.file));
    const videos = files.filter((f) => !isImage(f.file));
    if (videos.length === 0) throw new InputError('Add a video too: the picture is only the new background.');
    if (pictures.length > 1) throw new InputError('Add one picture for the background, with the videos to put it behind.');
    let bgKind = kind();
    if (pictures.length === 1) bgKind = 'image';
    else if (bgKind === 'image') throw new InputError('Add a picture with the video to use as the new background, or choose Blur or Colour.');
    const strength = num('strength', 6);
    const color = str('bg-color', '#00b140');
    const picture = pictures[0] ? await createImageBitmap(pictures[0].file) : undefined;

    // Find out now, in a second or two, that this browser cannot encode, not after the person finder has downloaded.
    progress.set('Checking this browser can write the video…', 0);
    if (!hasVideoEncoder()) throw new EncoderUnavailable();
    await requireH264Encoder();
    const { editVideo, videoSize } = await import('../lib/video-edit');
    const which = finder();
    progress.set(`Loading the person finder, once (about ${which === 'fast' ? '12' : '28'} MB)…`, 0.01);
    const { Matte, loadPersonMask } = await import('../lib/person-mask');
    // The fast model has a wide variant; load the one that fits the first video (a later one loads itself if it differs).
    const shape = await videoSize(videos[0]!.file).catch(() => undefined);
    await loadPersonMask(which, shape);
    const outputs: OutputFile[] = [];
    for (const [index, entry] of videos.entries()) {
      const file = entry.file;
      const share = (f: number) => (index + f) / videos.length;
      const matte = new Matte(which);
      const blurred = document.createElement('canvas');
      // The first figures of a slow start run long (2 to 3 times too long on a phone), so wait for 8% and 10 s of real work.
      const timeLeft = new TimeLeft(undefined, { minFraction: 0.08, minSeconds: 10 });
      const r = await editVideo(file, {
        // The frame is only drawn on and copied from; the person finder reads its own small canvas.
        readsBack: false,
        async paint(ctx) {
          await matte.apply(ctx, (c, frame) => {
            if (bgKind === 'color') {
              c.fillStyle = color;
              c.fillRect(0, 0, c.canvas.width, c.canvas.height);
            } else if (bgKind === 'image') cover(c, picture!);
            else drawBlurred(c, frame, blurred, strength);
          });
        },
        onProgress: (f) => {
          // It is slower than the video plays, so say how long is left: a long run with only a percentage reads as stuck.
          const left = timeLeft.update(f) ?? 'Estimating time left…';
          progress.set(`Replacing the background of ${file.name}: ${Math.round(f * 100)}% · ${left}. Keep this tab open.`, share(0.03 + f * 0.97));
        },
      });
      const found = matte.frames ? matte.framesWithPerson / matte.frames : 0;
      const what = bgKind === 'blur' ? 'background blurred' : bgKind === 'color' ? `background ${color}` : `background from ${pictures[0]!.file.name}`;
      outputs.push({
        name: suffixName(file.name, bgKind === 'blur' ? '-blurred-background' : '-new-background', r.ext),
        blob: r.blob,
        originalSize: file.size,
        note: `${describeEdit(r)}, ${what}, ${found < 0.05 ? 'no person found, so the whole picture was treated as background' : `a person in ${Math.round(found * 100)}% of frames`}. ${matte.pathNote()}`,
      });
    }
    return outputs;
  },
});
