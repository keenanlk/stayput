import { createShell, num, radio, str, type ShellFile } from '../lib/shell';
import { type OutputFile } from '../lib/files';
import { formatDuration } from '../lib/audio';
import { InputError } from '../lib/input-error';
import { TimeLeft } from '../lib/time-left';
import type { Backdrop, Shape } from '../lib/audio-video';

/**
 * Photo slideshow maker. The dropped pictures, in the order listed, and an
 * optional song become one MP4. The encoding runs in src/lib/slideshow.ts,
 * loaded on demand; nothing leaves the tab.
 */

const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|jxl)$/i.test(f.name);
const MAX_PHOTOS = 100;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('gif-panel');
const hint = $('gif-hint');
const canvas = $<HTMLCanvasElement>('gif-canvas');
const matchButton = $<HTMLButtonElement>('match-song');

let current: ShellFile[] = [];
const seconds = () => Math.min(10, Math.max(1, num('seconds', 3)));
const split = (files: ShellFile[]) => ({ pictures: files.filter((f) => isImage(f.file)), songs: files.filter((f) => !isImage(f.file)) });

function describe() {
  const { pictures, songs } = split(current);
  matchButton.disabled = songs.length !== 1;
  if (pictures.length === 0) {
    hint.textContent = songs.length ? 'Add the photos for the slideshow.' : '';
    return;
  }
  const total = pictures.length * seconds();
  hint.textContent = `${pictures.length} photo${pictures.length === 1 ? '' : 's'}, ${seconds()} s each: a video of ${formatDuration(total)}${songs.length ? ' with your song' : ''}.${pictures.length === 1 ? ' Add at least one more photo.' : ''}`;
}

let generation = 0;
async function preview() {
  const mine = ++generation;
  const first = split(current).pictures[0];
  if (!first) return;
  const { decodeImage } = await import('../lib/image');
  const { drawStill, SHAPES } = await import('../lib/audio-video');
  const { bitmap } = await decodeImage(first.file);
  if (mine !== generation) return bitmap.close();
  const shape = SHAPES[radio('shape', 'landscape') as Shape];
  const k = 480 / Math.max(shape.width, shape.height);
  const frame = { width: Math.round(shape.width * k), height: Math.round(shape.height * k) };
  canvas.width = frame.width;
  canvas.height = frame.height;
  const fill = str('fit', 'fit') === 'fill';
  drawStill(canvas.getContext('2d')!, frame, bitmap, str('backdrop', 'blur') as Backdrop, '', fill ? 'cover' : 'contain');
  bitmap.close();
}

for (const el of document.querySelectorAll<HTMLElement>('#seconds, #fit, #backdrop, input[name="shape"]')) {
  el.addEventListener('change', () => {
    describe();
    void preview().catch(() => undefined);
  });
}

matchButton.addEventListener('click', async () => {
  const song = split(current).songs[0];
  const count = split(current).pictures.length;
  if (!song || count === 0) return;
  const { decodePcm, SAMPLE_RATE } = await import('../lib/pcm');
  const pcm = await decodePcm(song.file);
  if (!pcm) return;
  const each = Math.min(10, Math.max(1, Math.round((pcm[0]!.length / SAMPLE_RATE / count) * 10) / 10));
  $<HTMLInputElement>('seconds').value = String(each);
  describe();
});

const shell = createShell({
  keepAwake: true,
  outputFormat: () => 'mp4',
  async onFilesChanged(files) {
    current = files;
    panel.hidden = split(files).pictures.length === 0;
    describe();
    try {
      await preview();
    } catch {
      panel.hidden = true;
    }
  },
  async process(files, progress) {
    const { pictures, songs } = split(files);
    if (pictures.length < 2) throw new InputError('Add at least two photos to make a slideshow.');
    if (pictures.length > MAX_PHOTOS) throw new InputError(`That is ${pictures.length} photos; the limit is ${MAX_PHOTOS}. Make two shorter slideshows and join them with Merge videos.`);
    if (songs.length > 1) throw new InputError('Add one song: it plays under the whole slideshow. Remove the others.');
    const { makeSlideshow } = await import('../lib/slideshow');
    const timeLeft = new TimeLeft(undefined, { minFraction: 0.05, minSeconds: 5 });
    const secondsPer = seconds();
    const r = await makeSlideshow(
      pictures.map((p) => p.file),
      {
        shape: radio('shape', 'landscape') as Shape,
        fit: str('fit', 'fit') === 'fill' ? 'fill' : 'fit',
        backdrop: str('backdrop', 'blur') as Backdrop,
        secondsPer,
        crossfade: str('transition', 'none') === 'fade',
        song: songs[0]?.file ?? null,
        onProgress: (f) => {
          const left = timeLeft.update(f) ?? 'Estimating time left…';
          progress.set(`Making the slideshow: ${Math.round(f * 100)}% · ${left}`, 0.02 + f * 0.98);
        },
      },
    );
    const out: OutputFile = {
      name: 'slideshow.mp4',
      blob: r.blob,
      originalSize: pictures.reduce((t, p) => t + p.file.size, 0),
      note: `${formatDuration(r.duration)}, ${r.width}×${r.height}, ${r.videoCodec}, ${pictures.length} photos${songs.length ? ' with song' : ', no sound'}`,
    };
    return [out];
  },
  resultsTitle: () => 'Your slideshow',
});
void shell;
