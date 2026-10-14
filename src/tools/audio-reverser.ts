import { createShell, processEach, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { formatDuration } from '../lib/audio';
import { FORMAT_LABELS, canWrite, convertAudio, formatOf, lossy, type AudioFormat } from '../lib/audio-convert';
import { reverseChannels } from '../lib/audio-reverse';

const BITRATES = [96, 128, 160, 192, 256, 320];

/** Keep about the original's bitrate when saving in its own lossy format. */
function bitrateFor(file: File, seconds: number): number {
  const kbps = (file.size * 8) / Math.max(0.1, seconds) / 1000;
  return BITRATES.find((b) => b >= kbps * 0.95) ?? 320;
}

createShell({
  outputFormat: () => str('format', 'same'),
  async process(files, progress) {
    const choice = str('format', 'same');
    return processEach(files, progress, 'Reversing', async (entry, index) => {
      const file = entry.file;
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading the sound of ${file.name}…`, share(0.05));
      let fmt: AudioFormat = choice === 'same' ? formatOf(file.name) ?? 'mp3' : (choice as AudioFormat);
      if (choice === 'same' && !(await canWrite(fmt))) fmt = 'mp3';
      let bitrate = 192;
      const r = await convertAudio(file, fmt, {
        bitrate,
        mono: false,
        transform: (chans, rate) => {
          if (choice === 'same' && lossy(fmt)) bitrate = bitrateFor(file, chans[0]!.length / rate);
          return reverseChannels(chans);
        },
        bitrateOf: () => bitrate,
        onProgress: (f) => progress.set(`Encoding ${file.name}: ${Math.round(f * 100)}%`, share(0.1 + f * 0.9)),
      });
      const out: OutputFile = {
        name: suffixName(file.name, '-reversed', fmt),
        blob: r.blob,
        originalSize: file.size,
        note: `Reversed, ${formatDuration(r.duration)}, ${FORMAT_LABELS[fmt]}${lossy(fmt) ? ` ${bitrate} kbps` : ''}`,
      };
      return out;
    });
  },
});
