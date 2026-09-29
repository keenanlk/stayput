import { bool, num, str } from '../lib/shell';
import { videoEditShell } from './video-edit-shell';

/**
 * Resize a video. "1080p" and friends set the short side, so a portrait phone
 * video becomes 1080 wide and a landscape one 1080 tall; a percentage scales
 * both sides; custom takes a width and height (one may be left empty).
 */

const size = document.getElementById('size') as HTMLSelectElement;
const custom = document.getElementById('custom-size') as HTMLElement;
const sync = () => (custom.hidden = size.value !== 'custom');
size.addEventListener('change', sync);
sync();

videoEditShell({
  suffix: '-resized',
  verb: 'Resizing',
  async options(file) {
    const mute = bool('mute');
    const choice = str('size', '720');
    if (choice === 'custom') {
      const width = num('width', 0) || undefined;
      const height = num('height', 0) || undefined;
      if (!width && !height) throw new Error('Enter a width, a height, or both.');
      if ((width && width < 16) || (height && height < 16)) throw new Error('Use at least 16 pixels for the width and height.');
      if ((width ?? 0) > 7680 || (height ?? 0) > 7680) throw new Error('The largest size this page can make is 7680 pixels on a side.');
      return { mute, width, height };
    }
    const { videoSize } = await import('../lib/video-edit');
    const { width, height } = await videoSize(file);
    if (choice.endsWith('%')) {
      const f = Number(choice.slice(0, -1)) / 100;
      return { mute, width: width * f };
    }
    const short = Number(choice);
    return width <= height ? { mute, width: short } : { mute, height: short };
  },
});
