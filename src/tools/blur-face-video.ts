import { bindRange, bool, num, radio, str } from '../lib/shell';
import { videoEditShell } from './video-edit-shell';
import { apply, effectSize, firstGrapheme, type Effect } from '../lib/blur';
import { nameBare } from '../lib/bare-error';
import { lazyImport, warm } from '../lib/lazy-import';
import { grow, isEngineAbort, isRetryable, SCAN_LIMIT, scanScale, unscale, updateTracks, type Track } from '../lib/face-track';
import { NamedError } from '../lib/input-error';
import { context2d, releaseCanvas } from '../lib/canvas-memory';

/**
 * Blur faces in a video. Each frame is decoded and drawn on a canvas; faces
 * are found with the same on-device detector as the photo tool about ten
 * times a second, followed between detections, and covered before the frame
 * is encoded again. Nothing leaves the tab.
 */

/** Seconds between detection passes. */
const SCAN = 0.1;
/** Keep covering a face this long after the detector last found it. */
const HOLD = 0.5;
/** Grow each cover by this share of the face on every side, for movement between passes. */
const MARGIN = 0.12;

const emojiInput = document.getElementById('emoji') as HTMLInputElement;
const effect = () => radio('effect', 'blur') as Effect;
const sync = () => {
  document.getElementById('strength-field')!.hidden = effect() === 'box' || effect() === 'emoji';
  document.getElementById('emoji-field')!.hidden = effect() !== 'emoji';
};
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="effect"]')) r.addEventListener('change', sync);
for (const b of document.querySelectorAll<HTMLButtonElement>('.emoji-pick')) b.addEventListener('click', () => (emojiInput.value = b.dataset.emoji ?? '🙂'));
bindRange('strength', 'strength-out');
sync();

let stats = { frames: 0, covered: 0, most: 0 };
/** A smaller copy of a large frame, which the face finder looks at instead: one canvas for the whole run. */
let small: HTMLCanvasElement | undefined;

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** A failure of the face finder, named for the step it came from. Emscripten's own error ("Aborted(...)") is the engine, in plain words. */
function faceFailure(step: string, e: unknown): Error {
  if (isEngineAbort(e)) {
    const err = new NamedError(step === 'FaceScanFailed' ? step : 'FaceEngineFailed', 'The face finder stopped working on this device. Reload the page and try again, or use a computer or another browser.');
    err.cause = e;
    return err;
  }
  return nameBare(step, e);
}

videoEditShell({
  suffix: '-faces-hidden',
  checkDecode: true,
  verb: 'Hiding faces in',
  onFilesChanged: (files) => {
    if (files.length > 0) warm(() => import('../lib/faces'));
  },
  options() {
    const kind = effect();
    const strength = num('strength', 6);
    const char = firstGrapheme(str('emoji', '🙂')) || '🙂';
    let tracks: Track[] = [];
    let last = -Infinity;
    // Frames beyond 1920 px are looked at in a smaller copy (a 4K frame is six times the pixels); halved again if the finder runs out of memory.
    let limit = SCAN_LIMIT;
    releaseCanvas(small);
    small = undefined;
    stats = { frames: 0, covered: 0, most: 0 };
    return {
      mute: bool('mute'),
      async paint(ctx, t) {
        const { width, height } = ctx.canvas;
        if (t - last >= SCAN || t < last) {
          last = t;
          // The detector lives with the photo tool; it downloads once (about 4 MB) and is cached.
          // A failure with no name of its own says which step it was: getting the detector, or reading a frame with it.
          // A model file that did not arrive, an engine that aborted while starting, or one that ran out of memory (a fresh one is
          // made by the next call) gets two more tries, a second apart, before the run fails: the frame is never left uncovered.
          for (let attempt = 0; ; attempt++) {
            let step = 'FaceModelFailed';
            try {
              const { findFaces } = await lazyImport(() => import('../lib/faces'));
              const scale = scanScale(width, height, limit);
              let source = ctx.canvas;
              if (scale < 1) {
                small ??= document.createElement('canvas');
                small.width = Math.max(1, Math.round(width * scale));
                small.height = Math.max(1, Math.round(height * scale));
                context2d(small).drawImage(ctx.canvas, 0, 0, small.width, small.height);
                source = small;
              }
              const found = await findFaces(source, (stage) => (step = stage === 'scanning' ? 'FaceScanFailed' : 'FaceModelFailed'), [0.5]);
              tracks = updateTracks(tracks, found.map((r) => unscale(r, scale)), t, HOLD);
              break;
            } catch (e) {
              if (attempt >= 2 || !isRetryable(e)) throw faceFailure(step, e);
              if (e instanceof Error && e.name === 'OutOfMemoryError') limit = Math.max(640, Math.floor(Math.max(width, height) / 2));
              await wait(1000 * (attempt + 1));
            }
          }
        } else tracks = tracks.filter((tr) => t - tr.seen <= HOLD);
        const size = effectSize(strength, width, height);
        for (const tr of tracks) apply(ctx, kind, grow(tr.rect, MARGIN, width, height), size, char);
        stats.frames++;
        if (tracks.length) stats.covered++;
        stats.most = Math.max(stats.most, tracks.length);
      },
    };
  },
  note() {
    if (!stats.frames) return undefined;
    if (!stats.covered) return 'no faces found: check the video before sharing it';
    return `faces covered in ${Math.round((stats.covered / stats.frames) * 100)}% of frames, up to ${stats.most} at once`;
  },
});
