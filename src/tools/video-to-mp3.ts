import { createShell, processEach, radio, str } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';
import { channelsOf, decodeAudio, encodeMp3, encodeWav, formatDuration, type Bitrate } from '../lib/audio';

const format = () => str('format', 'mp3') as 'mp3' | 'wav';
const bitrateField = document.getElementById('bitrate-field');
const syncFields = () => {
  if (bitrateField) bitrateField.hidden = format() === 'wav';
};
document.getElementById('format')?.addEventListener('change', syncFields);
syncFields();

createShell({
  outputFormat: format,
  async process(files, progress) {
    const fmt = format();
    const bitrate = Number(str('bitrate', '192')) as Bitrate;
    const mono = radio('channels', 'stereo') === 'mono';
    return processEach(files, progress, 'Converting', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading the audio from ${entry.file.name}…`, share(0.05));
      const buffer = await decodeAudio(entry.file);
      const chans = channelsOf(buffer, mono);
      let blob: Blob;
      if (fmt === 'wav') {
        blob = encodeWav(chans);
      } else {
        blob = await encodeMp3(chans, bitrate, (f) => progress.set(`Encoding ${entry.file.name} to MP3: ${Math.round(f * 100)}%`, share(0.1 + f * 0.9)));
      }
      const out: OutputFile = {
        name: replaceExt(entry.file.name, fmt),
        blob,
        originalSize: entry.file.size,
        note: `${formatDuration(buffer.duration)}, ${fmt === 'wav' ? '16-bit WAV' : `${bitrate} kbps`}${chans.length === 1 ? ', mono' : ''}`,
      };
      return out;
    });
  },
});
