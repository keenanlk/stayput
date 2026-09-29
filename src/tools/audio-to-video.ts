import { createShell, processEach, radio, str } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';
import { formatDuration } from '../lib/audio';
import type { Backdrop, Shape } from '../lib/audio-video';

/**
 * Audio to video. Each sound file becomes an MP4 showing one still picture
 * (the dropped image, or the title on a plain background) for the length of
 * the sound. The encoding runs in src/lib/audio-video.ts, loaded on demand.
 */

const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(f.name);

createShell({
  outputFormat: () => 'mp4',
  async process(files, progress) {
    const pictures = files.filter((f) => isImage(f.file));
    const sounds = files.filter((f) => !isImage(f.file));
    if (sounds.length === 0) throw new Error('Add a sound file (MP3, WAV, M4A…) to turn into a video.');
    if (pictures.length > 1) throw new Error('Add one picture: it is shown for the whole video. Remove the others.');
    const { audioToVideo } = await import('../lib/audio-video');
    let bitmap: ImageBitmap | null = null;
    if (pictures[0]) {
      const { decodeImage } = await import('../lib/image');
      bitmap = (await decodeImage(pictures[0].file)).bitmap;
    }
    const shape = radio('shape', 'landscape') as Shape;
    const backdrop = str('backdrop', 'blur') as Backdrop;
    try {
      return await processEach(sounds, progress, 'Making a video of', async (entry, index) => {
        const share = (f: number) => (index + f) / sounds.length;
        const title = entry.file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        const r = await audioToVideo(entry.file, bitmap, {
          shape,
          backdrop,
          title,
          onProgress: (f) => progress.set(`Making a video of ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.05 + f * 0.95)),
        });
        const out: OutputFile = {
          name: replaceExt(entry.file.name, 'mp4'),
          blob: r.blob,
          note: `${formatDuration(r.duration)}, ${r.width}×${r.height}, ${r.videoCodec}${bitmap ? '' : ', title on plain background'}`,
        };
        return out;
      });
    } finally {
      bitmap?.close();
    }
  },
});
