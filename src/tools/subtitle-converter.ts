import { createShell, processEach, str } from '../lib/shell';
import { replaceExt } from '../lib/files';
import { convertSubtitles, type SubtitleChoice } from '../lib/subtitle-convert';
import { InputError } from '../lib/input-error';

/** A subtitle file is a few hundred kilobytes at most; anything this large is not one. */
const MAX_BYTES = 20 * 1024 * 1024;

const MIME = { srt: 'application/x-subrip', vtt: 'text/vtt', txt: 'text/plain' } as const;
const BADGE = { srt: 'SRT', vtt: 'VTT', txt: 'TXT' } as const;

const choice = (): SubtitleChoice => {
  const v = str('sub-format', 'auto');
  return v === 'srt' || v === 'vtt' || v === 'txt' ? v : 'auto';
};

createShell({
  outputFormat: choice,
  async process(files, progress) {
    const picked = choice();
    return processEach(files, progress, 'Converting', async (entry) => {
      if (entry.file.size > MAX_BYTES) throw new InputError('This file is too large to be a subtitle file.');
      const { text, format, cues } = convertSubtitles(await entry.file.text(), picked);
      return {
        name: replaceExt(entry.file.name, format),
        blob: new Blob([text], { type: `${MIME[format]};charset=utf-8` }),
        originalSize: entry.file.size,
        badge: BADGE[format],
        note: `${cues} caption${cues === 1 ? '' : 's'}`,
      };
    });
  },
});
