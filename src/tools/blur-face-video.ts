import { bindRange, bool, num, radio, str } from '../lib/shell';
import { videoEditShell } from './video-edit-shell';
import { apply, effectSize, firstGrapheme, type Effect } from '../lib/blur';
import { grow, updateTracks, type Track } from '../lib/face-track';

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

videoEditShell({
  suffix: '-faces-hidden',
  verb: 'Hiding faces in',
  options() {
    const kind = effect();
    const strength = num('strength', 6);
    const char = firstGrapheme(str('emoji', '🙂')) || '🙂';
    let tracks: Track[] = [];
    let last = -Infinity;
    stats = { frames: 0, covered: 0, most: 0 };
    return {
      mute: bool('mute'),
      async paint(ctx, t) {
        const { width, height } = ctx.canvas;
        if (t - last >= SCAN || t < last) {
          last = t;
          // The detector lives with the photo tool; it downloads once (about 4 MB) and is cached.
          const { findFaces } = await import('../lib/faces');
          tracks = updateTracks(tracks, await findFaces(ctx.canvas, undefined, [0.5]), t, HOLD);
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
