import { bool, createShell, processEach, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { formatDuration } from '../lib/audio';
import { FORMAT_LABELS, canWrite, convertAudio, formatOf, lossy, type AudioFormat } from '../lib/audio-convert';
import { semitoneRatio, speedAndPitch } from '../lib/pitch';

const BITRATES = [96, 128, 160, 192, 256, 320];
const range = document.getElementById('semitones') as HTMLInputElement;
const out = document.getElementById('semitones-out')!;
const show = () => {
  const n = Number(range.value);
  out.textContent = `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} semitone${Math.abs(n) === 1 ? '' : 's'}`;
};
range.addEventListener('input', show);
show();

/** Keep about the original's bitrate when saving in its own lossy format. */
function bitrateFor(file: File, seconds: number): number {
  const kbps = (file.size * 8) / Math.max(0.1, seconds) / 1000;
  return BITRATES.find((b) => b >= kbps * 0.95) ?? 320;
}

function describe(semitones: number, speed: number, tape: boolean): string {
  const parts: string[] = [];
  if (tape && speed !== 1) parts.push(`${speed}× speed, pitch following`);
  else if (speed !== 1) parts.push(`${speed}× speed`);
  if (semitones) parts.push(`${semitones > 0 ? '+' : '−'}${Math.abs(semitones)} semitone${Math.abs(semitones) === 1 ? '' : 's'}`);
  return parts.join(', ');
}

createShell({
  outputFormat: () => str('format', 'same'),
  async process(files, progress) {
    const semitones = Number(str('semitones', '0'));
    const speed = Number(str('speed', '1'));
    const tape = bool('tape');
    if (!semitones && speed === 1) throw new Error('Choose a pitch or a speed to change: both are set to leave the sound as it is.');
    const pitch = semitoneRatio(semitones) * (tape ? speed : 1);
    const choice = str('format', 'same');
    const suffix = semitones && speed === 1 ? (semitones > 0 ? `-up${semitones}` : `-down${-semitones}`) : speed > 1 ? '-faster' : speed < 1 ? '-slower' : '-pitched';
    return processEach(files, progress, 'Changing', async (entry, index) => {
      const file = entry.file;
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${file.name}…`, share(0.05));
      let fmt: AudioFormat = choice === 'same' ? formatOf(file.name) ?? 'mp3' : (choice as AudioFormat);
      if (choice === 'same' && !(await canWrite(fmt))) fmt = 'mp3';
      let bitrate = 192;
      let seconds = 0;
      const r = await convertAudio(file, fmt, {
        bitrate,
        mono: false,
        transform: (chans, rate) => {
          if (choice === 'same' && lossy(fmt)) bitrate = bitrateFor(file, chans[0]!.length / rate);
          progress.set(`Changing ${file.name}…`, share(0.2));
          const changed = speedAndPitch(chans, speed, pitch);
          seconds = (changed[0]?.length ?? 0) / rate;
          return changed;
        },
        bitrateOf: () => bitrate,
        onProgress: (f) => progress.set(`Encoding ${file.name}: ${Math.round(f * 100)}%`, share(0.4 + f * 0.6)),
      });
      const o: OutputFile = {
        name: suffixName(file.name, suffix, fmt),
        blob: r.blob,
        originalSize: file.size,
        note: `${describe(semitones, speed, tape)}, ${formatDuration(seconds)}, ${FORMAT_LABELS[fmt]}${lossy(fmt) ? ` ${bitrate} kbps` : ''}`,
      };
      return o;
    });
  },
});
