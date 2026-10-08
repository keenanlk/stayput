import { bool, createShell } from '../lib/shell';
import type { OutputFile } from '../lib/files';

/**
 * Merge videos. The clips are decoded, laid end to end and encoded once into
 * an MP4 in the page (see src/lib/video-merge.ts); nothing leaves the tab.
 */

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}:${String(sec).padStart(2, '0')}` : `${sec} s`;
};

createShell({
  outputFormat: () => 'mp4',
  async process(files, progress) {
    if (files.length < 2) throw new Error('Add at least two videos to merge.');
    const mute = bool('mute');
    const { mergeVideos } = await import('../lib/video-merge');
    progress.set(`Reading ${files.length} videos…`, 0.01);
    const r = await mergeVideos(
      files.map((f) => f.file),
      { mute, onProgress: (f) => progress.set(`Merging ${files.length} videos: ${Math.round(f * 100)}%`, 0.02 + f * 0.98) },
    );
    const notes = [`${files.length} videos joined`, clock(r.duration), `${r.width}×${r.height}`, r.videoCodec];
    if (!r.audio) notes.push(r.audioDropped ? 'sound left out: this browser cannot encode it' : 'no sound');
    const out: OutputFile = {
      name: 'merged.mp4',
      blob: r.blob,
      originalSize: files.reduce((n, f) => n + f.file.size, 0),
      note: notes.join(', '),
    };
    return [out];
  },
  resultsTitle: () => 'Merged',
});
