import { createShell, processEach, radio, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { encodeWav, formatDuration } from '../lib/audio';
import { FORMAT_LABELS, canWrite, convertAudio, formatOf, lossy, type AudioFormat } from '../lib/audio-convert';
import { DENOISE_RATE, denoise, loadRnnoise, resample } from '../lib/denoise';
import { SAMPLE_RATE, decodePcm } from '../lib/pcm';
import { addAudio, hasVideo } from '../lib/video-audio';

const BITRATES = [96, 128, 160, 192, 256, 320];
const STRENGTH: Record<string, number> = { strong: 1, medium: 0.85, light: 0.65 };

/** Keep about the original's bitrate when saving in its own lossy format. */
function bitrateFor(file: File, seconds: number): number {
  const kbps = (file.size * 8) / Math.max(0.1, seconds) / 1000;
  return BITRATES.find((b) => b >= kbps * 0.95) ?? 320;
}

const voiceNote = (share: number) => (share < 0.05 ? 'no voice found, so most of the sound was treated as noise' : `voice in ${Math.round(share * 100)}% of it`);

createShell({
  outputFormat: () => str('format', 'same'),
  async process(files, progress) {
    const strength = STRENGTH[radio('strength', 'strong')] ?? 1;
    const choice = str('format', 'same');
    progress.set('Loading the noise remover…', 0.02);
    const rnnoise = await loadRnnoise();
    return processEach(files, progress, 'Cleaning', async (entry, index) => {
      const file = entry.file;
      const share = (f: number) => (index + f) / files.length;
      let voice = 0;
      const clean = async (chans: Float32Array[], rate: number) => {
        const at48 = await resample(chans, rate, DENOISE_RATE);
        const r = await denoise(rnnoise, at48, strength, (f) => progress.set(`Removing noise from ${file.name}: ${Math.round(f * 100)}%`, share(0.1 + f * 0.6)));
        voice = r.voice;
        return resample(r.chans, DENOISE_RATE, rate);
      };

      progress.set(`Reading the sound of ${file.name}…`, share(0.05));
      if (await hasVideo(file)) {
        const pcm = await decodePcm(file);
        if (!pcm || !pcm[0]?.length) throw new Error(`${file.name} has no sound to clean.`);
        const wav = new File([encodeWav(await clean(pcm, SAMPLE_RATE), SAMPLE_RATE)], 'sound.wav', { type: 'audio/wav' });
        const r = await addAudio(file, wav, { mode: 'replace', loop: false, fade: false, onProgress: (f) => progress.set(`Writing ${file.name}: ${Math.round(f * 100)}%`, share(0.7 + f * 0.3)) });
        const out: OutputFile = { name: suffixName(file.name, '-clean', r.ext), blob: r.blob, originalSize: file.size, note: `${voiceNote(voice)}, picture copied, ${formatDuration(r.duration)}` };
        return out;
      }

      let fmt: AudioFormat = choice === 'same' ? formatOf(file.name) ?? 'mp3' : (choice as AudioFormat);
      if (choice === 'same' && !(await canWrite(fmt))) fmt = 'mp3';
      let bitrate = 192;
      const r = await convertAudio(file, fmt, {
        bitrate,
        mono: false,
        transform: (chans, rate) => {
          if (choice === 'same' && lossy(fmt)) bitrate = bitrateFor(file, chans[0]!.length / rate);
          return clean(chans, rate);
        },
        bitrateOf: () => bitrate,
        onProgress: (f) => progress.set(`Encoding ${file.name}: ${Math.round(f * 100)}%`, share(0.7 + f * 0.3)),
      });
      const out: OutputFile = {
        name: suffixName(file.name, '-clean', fmt),
        blob: r.blob,
        originalSize: file.size,
        note: `${voiceNote(voice)}, ${formatDuration(r.duration)}, ${FORMAT_LABELS[fmt]}${lossy(fmt) ? ` ${bitrate} kbps` : ''}`,
      };
      return out;
    });
  },
});
