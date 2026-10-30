import { bool, createShell, processEach } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';
import { retryNote } from '../lib/edit-recovery';

/**
 * Video to AVI. Each file is re-encoded in the page and written by a hand-made AVI writer (see
 * src/lib/video-to-avi.ts and src/lib/avi-write.ts); nothing leaves the tab.
 */

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}:${String(sec).padStart(2, '0')}` : `${sec} s`;
};

createShell({
  keepAwake: true,
  remembersSize: true,
  outputFormat: () => 'avi',
  async process(files, progress) {
    const mute = bool('mute');
    const compat = bool('compat');
    // The encoder code is loaded only when someone converts.
    const { convertToAvi } = await import('../lib/video-to-avi');
    return processEach(files, progress, 'Converting', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${entry.file.name}…`, share(0.01));
      const r = await convertToAvi(entry.file, {
        mute,
        compat,
        onProgress: (f) => progress.set(`Converting ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.02 + f * 0.98)),
        onNotice: (m) => progress.set(m, share(0.02)),
      });
      const notes = [`${r.width}×${r.height}`, clock(r.duration), `${r.videoCodec} at ${Math.round(r.fps * 100) / 100} fps`];
      if (r.audio) notes.push(`${r.audio} sound`);
      else notes.push(r.audioDropped ? 'sound left out: this browser cannot read it' : 'no sound');
      const out: OutputFile = {
        name: replaceExt(entry.file.name, 'avi'),
        blob: r.blob,
        originalSize: entry.file.size,
        note: notes.join(', ') + retryNote(r.retry, r),
      };
      return out;
    });
  },
});
