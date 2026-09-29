import { bool, createShell, processEach, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import type { CompressMode } from '../lib/video-compress';

/**
 * Compress video. Each file is read, re-encoded and written as MP4 in the
 * page (see src/lib/video-compress.ts); nothing leaves the tab.
 */

const modeSelect = document.getElementById('mode') as HTMLSelectElement | null;
const sizeField = document.getElementById('size-field');
const syncSize = () => {
  if (sizeField) sizeField.hidden = modeSelect?.value !== 'size';
};
modeSelect?.addEventListener('change', syncSize);
syncSize();

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}:${String(sec).padStart(2, '0')}` : `${sec} s`;
};

createShell({
  outputFormat: () => 'mp4',
  async process(files, progress) {
    const mode = str('mode', 'balanced') as CompressMode;
    const targetMB = Number(str('size', '25'));
    const maxShortSide = Number(str('resolution', '0'));
    const mute = bool('mute');
    // About 400 KB of video code, loaded only when someone compresses.
    const { compressVideo } = await import('../lib/video-compress');
    return processEach(files, progress, 'Compressing', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${entry.file.name}…`, share(0.01));
      const r = await compressVideo(entry.file, {
        mode,
        targetMB,
        maxShortSide,
        mute,
        onProgress: (f) => progress.set(`Compressing ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.02 + f * 0.98)),
      });
      const notes = [`${r.width}×${r.height}`, clock(r.duration), r.videoCodec];
      if (!r.audio) notes.push(r.audioDropped ? 'sound left out: this browser cannot encode it' : 'no sound');
      if (mode === 'size' && r.blob.size > targetMB * 1e6) notes.push(`a little over ${targetMB} MB, try the next size down`);
      const out: OutputFile = {
        name: suffixName(entry.file.name, '-compressed', 'mp4'),
        blob: r.blob,
        originalSize: entry.file.size,
        note: notes.join(', '),
      };
      return out;
    });
  },
});
