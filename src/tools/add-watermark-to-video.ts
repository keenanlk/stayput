import { bindRange, bool, createShell, num, radio, str } from '../lib/shell';
import { InputError, NamedError } from '../lib/input-error';
import { drawVideoWatermark, hasMark, isPlace, type VideoWatermark } from '../lib/video-watermark';
import { videoEditShell } from './video-edit-shell';

/**
 * Add a watermark to a video. Each frame is decoded and drawn on a canvas by
 * src/lib/video-edit.ts, the text or logo is drawn over it, and the frame is
 * encoded again. The first frame is shown with the mark as a preview.
 * Nothing leaves the tab.
 */

bindRange('wm-size', 'wm-size-out');
bindRange('wm-opacity', 'wm-opacity-out');

const logoInput = document.getElementById('wm-logo') as HTMLInputElement;
let logo: ImageBitmap | undefined;
let logoError = '';

const kind = () => (radio('kind', 'text') === 'image' ? 'image' : 'text');

function current(): VideoWatermark {
  const place = str('wm-place', 'bottom-right');
  return {
    kind: kind(),
    text: str('wm-text', ''),
    image: logo,
    place: isPlace(place) ? place : 'bottom-right',
    size: num('wm-size', 4),
    opacity: num('wm-opacity', 70) / 100,
    color: str('wm-color', '#ffffff'),
  };
}

const panel = document.getElementById('wm-panel')!;
const canvas = document.getElementById('wm-canvas') as HTMLCanvasElement;
const hint = document.getElementById('wm-hint')!;
let frame: ImageBitmap | undefined;
let frameNote = '';

function redraw() {
  if (!frame) return;
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(frame, 0, 0);
  drawVideoWatermark(ctx, frame.width, frame.height, current());
  hint.textContent = logoError || frameNote;
}

function sync() {
  const image = kind() === 'image';
  document.getElementById('wm-text-field')!.hidden = image;
  document.getElementById('wm-color-field')!.hidden = image;
  document.getElementById('wm-logo-field')!.hidden = !image;
  redraw();
}

for (const r of document.querySelectorAll<HTMLInputElement>('input[name="kind"]')) r.addEventListener('change', sync);
const options = document.getElementById('options');
options?.addEventListener('input', redraw);
options?.addEventListener('change', redraw);

logoInput.addEventListener('change', async () => {
  logo?.close();
  logo = undefined;
  logoError = '';
  const file = logoInput.files?.[0];
  if (file) {
    try {
      logo = await createImageBitmap(file);
    } catch {
      logoError = 'This browser could not read that image. Try a PNG.';
    }
  }
  redraw();
});

async function firstFrame(file: File): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    await new Promise<void>((ok, bad) => {
      const timer = setTimeout(() => bad(new NamedError('AddWatermarkToVideoFailed', 'Timed out opening the video.')), 20_000);
      v.onloadeddata = () => (clearTimeout(timer), ok());
      v.onerror = () => (clearTimeout(timer), bad(new NamedError('AddWatermarkToVideoFailed', 'This browser cannot play this video, so there is no preview. The watermark can still be added if its decoder can read it.')));
      v.src = url;
    });
    const at = Number.isFinite(v.duration) ? Math.min(1, v.duration / 3) : 0;
    if (at > 0) {
      await new Promise<void>((ok) => {
        const timer = setTimeout(ok, 3000);
        v.onseeked = () => (clearTimeout(timer), ok());
        v.currentTime = at;
      });
    }
    const s = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
    return await createImageBitmap(v, { resizeWidth: Math.max(1, Math.round(v.videoWidth * s)), resizeHeight: Math.max(1, Math.round(v.videoHeight * s)) });
  } finally {
    URL.revokeObjectURL(url);
  }
}

videoEditShell({
  suffix: '-watermarked',
  verb: 'Watermarking',
  onFilesChanged: async (files) => {
    frame?.close();
    frame = undefined;
    panel.hidden = true;
    if (!files.length) return;
    try {
      frame = await firstFrame(files[0]!.file);
      frameNote = files.length > 1 ? `Preview of the first video. The same watermark goes on all ${files.length}, scaled to each one’s size.` : 'Preview. The saved video is full size.';
      panel.hidden = false;
      redraw();
    } catch {
      // No preview, but the run can still work through the decoder.
    }
  },
  options() {
    const mark = current();
    if (mark.kind === 'image' && !mark.image) throw new InputError(logoError || 'Pick a logo image first, or choose Text.');
    if (!hasMark(mark)) throw new InputError('Type the watermark text first.');
    return {
      mute: bool('mute'),
      readsBack: false,
      matchSourceBitrate: true,
      paint(ctx) {
        drawVideoWatermark(ctx, ctx.canvas.width, ctx.canvas.height, mark);
      },
    };
  },
});
