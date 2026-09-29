import { createShell, num, processEach, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { formatDuration } from '../lib/audio';
import { FORMAT_LABELS, canWrite, convertAudio, formatOf, lossy, type AudioFormat } from '../lib/audio-convert';
import { removeSilence } from '../lib/silence';

/**
 * Remove silence. The sound is decoded in the tab, long pauses are shortened
 * (src/lib/silence.ts), and the result is written in the chosen format.
 * Nothing is uploaded.
 */

const BITRATES = [96, 128, 160, 192, 256, 320];
/** Short lengths to a tenth of a second, longer ones as minutes and seconds. */
const length = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : formatDuration(s));
/** Keep about the original's bitrate when saving in its own lossy format. */
function bitrateFor(file: File, seconds: number): number {
  const kbps = (file.size * 8) / Math.max(0.1, seconds) / 1000;
  return BITRATES.find((b) => b >= kbps * 0.95) ?? 320;
}

createShell({
  outputFormat: () => str('format', 'same'),
  async process(files, progress) {
    const thresholdDb = num('threshold', -40);
    const minSilence = num('min-silence', 0.5);
    const keep = num('keep', 0.25);
    const choice = str('format', 'same');
    return processEach(files, progress, 'Removing silence from', async (entry, index) => {
      const file = entry.file;
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${file.name}…`, share(0.05));
      let fmt: AudioFormat = choice === 'same' ? formatOf(file.name) ?? 'mp3' : (choice as AudioFormat);
      if (choice === 'same' && !(await canWrite(fmt))) fmt = 'mp3';
      let bitrate = 192;
      let before = 0;
      let after = 0;
      let removed = 0;
      let cuts = 0;
      const r = await convertAudio(file, fmt, {
        bitrate,
        mono: false,
        transform: (chans, rate) => {
          before = (chans[0]?.length ?? 0) / rate;
          if (choice === 'same' && lossy(fmt)) bitrate = bitrateFor(file, before);
          progress.set(`Finding pauses in ${file.name}…`, share(0.2));
          const out = removeSilence(chans, rate, { thresholdDb, minSilence, keep });
          removed = out.removed;
          cuts = out.cuts;
          after = (out.chans[0]?.length ?? 0) / rate;
          return out.chans;
        },
        bitrateOf: () => bitrate,
        onProgress: (f) => progress.set(`Encoding ${file.name}: ${Math.round(f * 100)}%`, share(0.4 + f * 0.6)),
      });
      const note = cuts
        ? `${length(before)} to ${length(after)}: ${length(removed)} of silence removed from ${cuts} pause${cuts === 1 ? '' : 's'}`
        : `no pauses long enough to shorten; try the noisy-room setting or a shorter length`;
      const o: OutputFile = {
        name: suffixName(file.name, '-no-silence', fmt),
        blob: r.blob,
        originalSize: file.size,
        note: `${note}, ${FORMAT_LABELS[fmt]}${lossy(fmt) ? ` ${bitrate} kbps` : ''}`,
      };
      return o;
    });
  },
});
