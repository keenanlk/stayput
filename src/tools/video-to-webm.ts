import { bool, createShell, processEach } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';
import { retryNote } from '../lib/edit-recovery';

/**
 * Video to WebM. Each file is remuxed or re-encoded in the page (see
 * src/lib/video-webm.ts); nothing leaves the tab.
 */

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}:${String(sec).padStart(2, '0')}` : `${sec} s`;
};

createShell({
  keepAwake: true,
  remembersSize: true,
  outputFormat: () => 'webm',
  async process(files, progress) {
    const mute = bool('mute');
    // About 400 KB of video code, loaded only when someone converts.
    const { convertToWebm } = await import('../lib/video-webm');
    return processEach(files, progress, 'Converting', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${entry.file.name}…`, share(0.01));
      const r = await convertToWebm(entry.file, {
        mute,
        onProgress: (f) => progress.set(`Converting ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.02 + f * 0.98)),
        onNotice: (m) => progress.set(m, share(0.02)),
      });
      const notes = [`${r.width}×${r.height}`, clock(r.duration), r.videoCopied ? `${r.videoCodec} copied, no quality loss` : `re-encoded to ${r.videoCodec}`];
      if (!r.audio) notes.push(r.audioDropped ? 'sound left out: this browser cannot encode it' : 'no sound');
      const out: OutputFile = {
        name: replaceExt(entry.file.name, 'webm'),
        blob: r.blob,
        originalSize: entry.file.size,
        note: notes.join(', ') + retryNote(r.retry, r),
      };
      return out;
    });
  },
});
