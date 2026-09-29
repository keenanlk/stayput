import { createShell, str } from '../lib/shell';
import { baseName, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import type { FrameEvery } from '../lib/video-frames';

/**
 * Video to JPG. Frames are decoded and saved as images in the page (see
 * src/lib/video-frames.ts); nothing leaves the tab.
 */

const LIMIT = 1000;
const PREVIEWS = 48;

const stamp = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${m}:${sec}`;
};

createShell({
  outputFormat: () => (str('format', 'image/jpeg') === 'image/png' ? 'png' : 'jpg'),
  async process(files, progress) {
    const entry = files[0]!;
    const type = str('format', 'image/jpeg') === 'image/png' ? 'image/png' : 'image/jpeg';
    const ext = type === 'image/png' ? 'png' : 'jpg';
    const raw = str('every', '1');
    const every: FrameEvery = raw === 'all' ? 'all' : raw.startsWith('spread:') ? (raw as `spread:${number}`) : Number(raw);
    const { extractFrames } = await import('../lib/video-frames');
    const base = baseName(entry.file.name);
    const outs: OutputFile[] = [];
    progress.set(`Reading ${entry.file.name}…`, 0.01);
    const info = await extractFrames(entry.file, {
      every,
      type,
      quality: 0.92,
      limit: LIMIT,
      async onFrame(frame, i, estimate) {
        let previewUrl: string | undefined;
        if (i < PREVIEWS) {
          const bitmap = await createImageBitmap(frame.canvas);
          previewUrl = await thumbnail(bitmap);
          bitmap.close();
        }
        outs.push({ name: `${base}-${String(i + 1).padStart(4, '0')}.${ext}`, blob: frame.blob, previewUrl, note: `at ${stamp(frame.time)}` });
        progress.set(`Saving frame ${i + 1} of about ${estimate}`, Math.min(0.99, (i + 1) / Math.max(1, estimate)));
      },
    });
    if (!outs.length) throw new Error('No frames could be read from this video.');
    if (info.capped) outs[outs.length - 1]!.note += `, stopped at ${LIMIT} frames: pick fewer frames a second to cover the whole video`;
    return outs;
  },
  resultsTitle: (outs) => `${outs.length} frame${outs.length === 1 ? '' : 's'}`,
});
