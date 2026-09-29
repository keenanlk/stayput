import { createShell, processEach } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import type { EditOptions, EditResult } from '../lib/video-edit';

/**
 * Shared shell for the simple video edits (remove sound, resize, rotate and
 * flip). Each tool page says how to read its options; the edit itself runs in
 * src/lib/video-edit.ts, loaded on demand. Nothing leaves the tab.
 */

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}:${String(sec).padStart(2, '0')}` : `${sec} s`;
};

export function describeEdit(r: EditResult): string {
  const notes = [`${r.width}×${r.height}`, clock(r.duration), r.reencoded ? `re-encoded to ${r.videoCodec}` : `${r.videoCodec} copied, no quality loss`];
  if (!r.audio) notes.push(r.audioDropped ? 'sound left out: this browser cannot encode it' : 'no sound');
  return notes.join(', ');
}

export function videoEditShell(config: {
  suffix: string;
  verb: string;
  /** Read the options for one file (some depend on the video's own size). */
  options: (file: File) => Promise<Omit<EditOptions, 'onProgress'>> | Omit<EditOptions, 'onProgress'>;
  /** More to say about the file just made, after the size and codec. */
  note?: () => string | undefined;
}) {
  return createShell({
    async process(files, progress) {
      // About 400 KB of video code, loaded only when someone runs the tool.
      const { editVideo } = await import('../lib/video-edit');
      return processEach(files, progress, config.verb, async (entry, index) => {
        const share = (f: number) => (index + f) / files.length;
        progress.set(`Reading ${entry.file.name}…`, share(0.01));
        const r = await editVideo(entry.file, {
          ...(await config.options(entry.file)),
          onProgress: (f) => progress.set(`${config.verb} ${entry.file.name}: ${Math.round(f * 100)}%`, share(0.02 + f * 0.98)),
        });
        const out: OutputFile = {
          name: suffixName(entry.file.name, config.suffix, r.ext),
          blob: r.blob,
          originalSize: entry.file.size,
          note: [describeEdit(r), config.note?.()].filter(Boolean).join(', '),
        };
        return out;
      });
    },
  });
}
