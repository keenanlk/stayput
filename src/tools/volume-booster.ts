import { createShell, processEach, radio, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { encodeWav, formatDuration } from '../lib/audio';
import { FORMAT_LABELS, canWrite, convertAudio, formatOf, lossy, type AudioFormat } from '../lib/audio-convert';
import { applyGain, dbToGain, gainFor, type VolumeMode } from '../lib/audio-gain';
import { SAMPLE_RATE, decodePcm } from '../lib/pcm';
import { addAudio, hasVideo } from '../lib/video-audio';

/** Streaming services play music at about -14 LUFS; this lands close to that. */
const NORMALIZE_TARGET = -14;
const BITRATES = [96, 128, 160, 192, 256, 320];

const mode = (): VolumeMode => (radio('mode', 'boost') === 'normalize' ? { kind: 'normalize', target: NORMALIZE_TARGET } : { kind: 'boost', db: Number(str('db', '6')) });
const dbField = document.getElementById('db-field');
const modeNote = document.getElementById('mode-note');
const sync = () => {
  const normalize = mode().kind === 'normalize';
  if (dbField) dbField.hidden = normalize;
  if (modeNote) modeNote.textContent = normalize ? 'Brings every file to the same, comfortable loudness, like a streaming app does.' : 'Peaks that would clip are gently turned down, so nothing distorts.';
};
document.querySelectorAll('input[name="mode"]').forEach((el) => el.addEventListener('change', sync));
sync();

const signed = (db: number) => `${db >= 0 ? '+' : '−'}${Math.abs(db).toFixed(1)} dB`;
const suffix = (m: VolumeMode, db: number) => (m.kind === 'normalize' ? '-normalized' : db >= 0 ? '-louder' : '-quieter');

/** Keep about the original's bitrate when saving in its own lossy format. */
function bitrateFor(file: File, seconds: number): number {
  const kbps = (file.size * 8) / Math.max(0.1, seconds) / 1000;
  return BITRATES.find((b) => b >= kbps * 0.95) ?? 320;
}

createShell({
  outputFormat: () => str('format', 'same'),
  async process(files, progress) {
    const m = mode();
    const choice = str('format', 'same');
    return processEach(files, progress, 'Changing the volume of', async (entry, index) => {
      const file = entry.file;
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading the sound of ${file.name}…`, share(0.05));
      let db = 0;
      let limited = 0;
      const change = (chans: Float32Array[], rate: number) => {
        db = gainFor(m, chans, rate);
        const r = applyGain(chans, dbToGain(db), rate);
        limited = r.limited;
        return r.chans;
      };
      const tail = () => `${signed(db)}${limited > 0.0005 ? `, ${(limited * 100).toFixed(1)}% of peaks eased` : ''}`;

      if (await hasVideo(file)) {
        const pcm = await decodePcm(file);
        if (!pcm || !pcm[0]?.length) throw new Error(`${file.name} has no sound to change.`);
        const wav = new File([encodeWav(change(pcm, SAMPLE_RATE), SAMPLE_RATE)], 'sound.wav', { type: 'audio/wav' });
        const r = await addAudio(file, wav, { mode: 'replace', loop: false, fade: false, onProgress: (f) => progress.set(`Writing ${file.name}: ${Math.round(f * 100)}%`, share(0.2 + f * 0.8)) });
        const out: OutputFile = { name: suffixName(file.name, suffix(m, db), r.ext), blob: r.blob, originalSize: file.size, note: `${tail()}, picture copied, ${formatDuration(r.duration)}` };
        return out;
      }

      let fmt: AudioFormat = choice === 'same' ? formatOf(file.name) ?? 'mp3' : (choice as AudioFormat);
      if (choice === 'same' && !(await canWrite(fmt))) fmt = 'mp3';
      // Same format: estimate the original bitrate from size and length after decoding.
      let bitrate = 192;
      const r = await convertAudio(file, fmt, {
        bitrate,
        mono: false,
        transform: (chans, rate) => {
          if (choice === 'same' && lossy(fmt)) bitrate = bitrateFor(file, chans[0]!.length / rate);
          return change(chans, rate);
        },
        bitrateOf: () => bitrate,
        onProgress: (f) => progress.set(`Encoding ${file.name}: ${Math.round(f * 100)}%`, share(0.1 + f * 0.9)),
      });
      const out: OutputFile = {
        name: suffixName(file.name, suffix(m, db), fmt),
        blob: r.blob,
        originalSize: file.size,
        note: `${tail()}, ${formatDuration(r.duration)}, ${FORMAT_LABELS[fmt]}${lossy(fmt) ? ` ${bitrate} kbps` : ''}`,
      };
      return out;
    });
  },
});
