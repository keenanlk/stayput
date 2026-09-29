import { bool, radio } from '../lib/shell';
import type { Rotation } from 'mediabunny';
import { videoEditShell } from './video-edit-shell';

/** Rotate or flip a video; the turn is baked into the pixels so every player shows it the same way. */
videoEditShell({
  suffix: '-rotated',
  verb: 'Rotating',
  options() {
    const rotate = Number(radio('rotate', '90')) as Rotation;
    const flip = bool('flip-h');
    const flipVertical = bool('flip-v');
    if (!rotate && !flip && !flipVertical) throw new Error('Choose a rotation or a flip first.');
    return { rotate, flip, flipVertical, mute: bool('mute') };
  },
});
