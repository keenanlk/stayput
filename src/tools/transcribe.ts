import { createShell, processEach, radio, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { formatDuration } from '../lib/audio';
import { toSrt, toText, toVtt } from '../lib/captions';
import { transcribeFile } from '../lib/speech';
import { noSpeechFound } from '../lib/speech-errors';
import type { Request } from '../lib/transcribe.worker';

/**
 * Transcribe speech in an audio or video file to text or subtitles, with
 * Whisper running in a worker (src/lib/speech.ts). Nothing is uploaded.
 */

const NAMES = new Intl.DisplayNames(['en'], { type: 'language' });
const EXT = { txt: 'txt', srt: 'srt', vtt: 'vtt' } as const;
const TYPE = { txt: 'text/plain', srt: 'application/x-subrip', vtt: 'text/vtt' } as const;

createShell({
  outputFormat: () => str('format', 'txt'),
  async process(files, progress) {
    const language = str('language', 'auto');
    const task = radio('task', 'transcribe') as Request['task'];
    const format = str('format', 'txt') as keyof typeof EXT;
    return processEach(files, progress, 'Transcribing', async (entry, index) => {
      const file = entry.file;
      const share = (f: number) => (index + f) / files.length;
      const { segments: tidy, language: spoken, duration: total } = await transcribeFile(file, {
        language,
        task,
        onProgress: (message, f) => progress.set(message, share(f)),
      });
      if (tidy.length === 0) throw noSpeechFound('No speech was found in this recording.');
      const body = format === 'srt' ? toSrt(tidy) : format === 'vtt' ? toVtt(tidy) : toText(tidy);
      // Chinese, Japanese and Thai are written without spaces, so count characters there.
      const unspaced = ['zh', 'ja', 'th', 'lo', 'my', 'km'].includes(spoken);
      const count = unspaced ? tidy.reduce((n, s) => n + s.text.replace(/\s/g, '').length, 0) : tidy.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
      const amount = `${count.toLocaleString('en')} ${unspaced ? 'characters' : 'words'}`;
      const out: OutputFile = {
        name: suffixName(file.name, task === 'translate' ? '-english' : '', EXT[format]),
        blob: new Blob([body], { type: `${TYPE[format]};charset=utf-8` }),
        originalSize: file.size,
        note: `${formatDuration(total)} of ${NAMES.of(spoken) ?? spoken} speech, ${amount}${format === 'txt' ? '' : ` in ${tidy.length} caption${tidy.length === 1 ? '' : 's'}`}`,
        text: body,
      };
      return out;
    });
  },
  resultsTitle: () => 'Transcript',
});
