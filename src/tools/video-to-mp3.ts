import { nameBare } from '../lib/bare-error';
import { createShell, processEach, radio, str } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';
import { id3Tag, wmaTagsOf } from '../lib/wma-convert';
import { channelsOf, decodeAudio, encodeMp3, encodeWav, formatDuration, type Bitrate } from '../lib/audio';
import { retryUnreadable } from '../lib/read-failure';

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
      const buffer = await retryUnreadable(entry.file, () => decodeAudio(entry.file), (message) => progress.set(`${entry.file.name}: ${message}`, share(0.05))).catch((e) => {
        throw nameBare('AudioReadFailed', e);
      });
      const chans = channelsOf(buffer, mono);
      let blob: Blob;
      if (fmt === 'wav') {
        blob = encodeWav(chans);
      } else {
        // The MP3 encoder loads on first use: a connection that drops here fails the load with a bare TypeError ("Failed to fetch").
        blob = await encodeMp3(chans, bitrate, (f) => progress.set(`Encoding ${entry.file.name} to MP3: ${Math.round(f * 100)}%`, share(0.1 + f * 0.9))).catch((e) => {
          throw nameBare('Mp3EncodeFailed', e);
        });
        // A WMA's title, artist and album go into the MP3 as an ID3 tag.
        const tag = id3Tag(wmaTagsOf(buffer));
        if (tag) blob = new Blob([tag as BlobPart, blob], { type: 'audio/mpeg' });
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
