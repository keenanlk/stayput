import { createShell, processEach, radio, str } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';
import { formatDuration } from '../lib/audio';
import { FORMAT_LABELS, canWrite, convertAudio, lossy, type AudioFormat } from '../lib/audio-convert';

const format = () => str('format', 'mp3') as AudioFormat;
const bitrateField = document.getElementById('bitrate-field');
const note = document.getElementById('format-note');
const NOTES: Partial<Record<AudioFormat, string>> = {
  flac: 'FLAC keeps every sample of the original at its own sample rate, at about half the size of a WAV.',
  wav: 'WAV keeps the original sample rate and is about 10 MB per minute of stereo.',
};
const syncFields = async () => {
  const f = format();
  if (bitrateField) bitrateField.hidden = !lossy(f);
  if (!note) return;
  let text = NOTES[f] ?? '';
  if (!(await canWrite(f))) {
    text = f === 'm4a'
      ? 'This browser cannot write M4A (it has no AAC encoder). Safari, and Chrome or Edge on Windows and Mac, can. MP3 plays in all the same places.'
      : 'This browser cannot write OGG Opus. Chrome, Edge and Firefox can.';
  }
  note.textContent = text;
  note.hidden = !text;
};
document.getElementById('format')?.addEventListener('change', syncFields);
void syncFields();

createShell({
  outputFormat: format,
  async process(files, progress) {
    const fmt = format();
    const bitrate = Number(str('bitrate', '192'));
    const mono = radio('channels', 'stereo') === 'mono';
    return processEach(files, progress, 'Converting', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading the audio from ${entry.file.name}…`, share(0.05));
      const r = await convertAudio(entry.file, fmt, {
        bitrate,
        mono,
        onProgress: (f) => progress.set(`Encoding ${entry.file.name} to ${fmt.toUpperCase()}: ${Math.round(f * 100)}%`, share(0.1 + f * 0.9)),
      });
      const detail = lossy(fmt) ? `${bitrate} kbps` : `${(r.sampleRate / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} kHz`;
      const out: OutputFile = {
        name: replaceExt(entry.file.name, fmt),
        blob: r.blob,
        originalSize: entry.file.size,
        note: `${formatDuration(r.duration)}, ${FORMAT_LABELS[fmt]}, ${detail}${r.channels === 1 ? ', mono' : ''}`,
      };
      return out;
    });
  },
});
