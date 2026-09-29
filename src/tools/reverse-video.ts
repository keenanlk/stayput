import { bool, createShell, processEach } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';

/**
 * Reverse video. Each video is decoded backwards in short windows and encoded
 * again in the page (see src/lib/video-reverse.ts); nothing leaves the tab.
 */

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}:${String(sec).padStart(2, '0')}` : `${sec} s`;
};

createShell({
  outputFormat: () => 'mp4',
  async process(files, progress) {
    const mute = bool('mute');
    const { reverseVideo } = await import('../lib/video-reverse');
    return processEach(files, progress, 'Reversing', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${entry.file.name}…`, share(0.01));
      const r = await reverseVideo(entry.file, {
        mute,
        onProgress: (f) => progress.set(`Reversing ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.02 + f * 0.98)),
      });
      const notes = ['reversed', clock(r.duration), `${r.width}×${r.height}`, r.videoCodec];
      if (!r.audio) notes.push('no sound');
      const out: OutputFile = {
        name: suffixName(entry.file.name, '-reversed', 'mp4'),
        blob: r.blob,
        originalSize: entry.file.size,
        note: notes.join(', '),
      };
      return out;
    });
  },
});
