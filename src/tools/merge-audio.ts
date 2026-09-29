import { createShell, str } from '../lib/shell';
import type { OutputFile } from '../lib/files';
import { SAMPLE_RATE, channelsOf, decodeAudio, encodeMp3, encodeWav, formatDuration, type Bitrate } from '../lib/audio';
import { joinParts, parseBetween } from '../lib/audio-merge';

/**
 * Merge audio. Each file is decoded by the browser at 44.1 kHz, the sounds are
 * laid end to end (with silence or a crossfade if chosen), and the result is
 * written once as MP3 or WAV in the page. Nothing leaves the tab.
 */

const format = () => (str('format', 'mp3') === 'wav' ? 'wav' : 'mp3');
const bitrateField = document.getElementById('bitrate-field');
const sync = () => {
  if (bitrateField) bitrateField.hidden = format() !== 'mp3';
};
document.getElementById('format')?.addEventListener('change', sync);
sync();

createShell({
  outputFormat: format,
  resultsTitle: () => 'Merged',
  async process(files, progress) {
    if (files.length < 2) throw new Error('Add at least two audio files to merge.');
    const parts: Float32Array[][] = [];
    for (const [i, entry] of files.entries()) {
      progress.set(`Reading ${entry.file.name} (${i + 1} of ${files.length})…`, (i / files.length) * 0.4);
      try {
        parts.push(channelsOf(await decodeAudio(entry.file, SAMPLE_RATE), false));
      } catch (e) {
        throw new Error(`${entry.file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    progress.set('Joining…', 0.42);
    const between = parseBetween(str('between', 'none'));
    const joined = joinParts(parts, SAMPLE_RATE, between);
    const seconds = joined[0]!.length / SAMPLE_RATE;
    const fmt = format();
    const bitrate = Number(str('bitrate', '192')) as Bitrate;
    const blob =
      fmt === 'wav'
        ? encodeWav(joined)
        : await encodeMp3(joined, bitrate, (f) => progress.set(`Writing the MP3: ${Math.round(f * 100)}%`, 0.45 + f * 0.55));
    const how = between.kind === 'gap' ? `${between.seconds} s of silence between` : between.kind === 'fade' ? `${between.seconds} s crossfades` : '';
    const out: OutputFile = {
      name: `merged.${fmt}`,
      blob,
      note: [`${files.length} files joined`, formatDuration(seconds), how, fmt === 'mp3' ? `MP3 ${bitrate} kbps` : '16-bit WAV', joined.length === 1 ? 'mono' : ''].filter(Boolean).join(', '),
    };
    return [out];
  },
});
