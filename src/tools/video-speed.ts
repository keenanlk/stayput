import { bool, createShell, processEach, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';

/**
 * Change video speed. Each video is re-timed and re-encoded in the page (see
 * src/lib/video-speed.ts); nothing leaves the tab.
 */

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}:${String(sec).padStart(2, '0')}` : `${sec} s`;
};

createShell({
  outputFormat: () => 'mp4',
  async process(files, progress) {
    const speed = Number(str('speed', '2'));
    const mute = bool('mute');
    const { changeSpeed } = await import('../lib/video-speed');
    return processEach(files, progress, 'Changing speed of', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${entry.file.name}…`, share(0.01));
      const r = await changeSpeed(entry.file, {
        speed,
        mute,
        onProgress: (f) => progress.set(`Changing speed of ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.02 + f * 0.98)),
      });
      const notes = [`${speed}× speed`, `now ${clock(r.duration)}`, `${r.width}×${r.height}`, r.videoCodec];
      if (!r.audio) notes.push('no sound');
      const out: OutputFile = {
        name: suffixName(entry.file.name, `-${String(speed).replace('.', '_')}x`, 'mp4'),
        blob: r.blob,
        originalSize: entry.file.size,
        note: notes.join(', '),
      };
      return out;
    });
  },
});
