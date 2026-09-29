import { bool, createShell, processEach } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';

/**
 * Video to MP4. Each file is remuxed or re-encoded in the page (see
 * src/lib/video-convert.ts); nothing leaves the tab.
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
    // About 400 KB of video code, loaded only when someone converts.
    const { convertToMp4 } = await import('../lib/video-convert');
    return processEach(files, progress, 'Converting', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${entry.file.name}…`, share(0.01));
      const r = await convertToMp4(entry.file, {
        mute,
        onProgress: (f) => progress.set(`Converting ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.02 + f * 0.98)),
      });
      const notes = [`${r.width}×${r.height}`, clock(r.duration), r.videoCopied ? `${r.videoCodec} copied, no quality loss` : `re-encoded to ${r.videoCodec}`];
      if (!r.audio) notes.push(r.audioDropped ? 'sound left out: this browser cannot encode it' : 'no sound');
      const out: OutputFile = {
        name: replaceExt(entry.file.name, 'mp4'),
        blob: r.blob,
        originalSize: entry.file.size,
        note: notes.join(', '),
      };
      return out;
    });
  },
});
