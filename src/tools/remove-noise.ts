import { createShell, processEach, radio, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { formatDuration } from '../lib/audio';
import { FORMAT_LABELS, canWrite, convertAudio, formatOf, hideUnwritable, lossy, type AudioFormat } from '../lib/audio-convert';
import { longRecordingHint } from '../lib/long-audio';
import { DENOISE_RATE, denoise, inStage, loadRnnoise, resample } from '../lib/denoise';
import { SAMPLE_RATE, decodePcmSliced } from '../lib/pcm';
import { addAudio, hasVideo } from '../lib/video-audio';
import { audioDecodeError } from '../lib/speech-errors';
import { retryUnreadable, snapshotFile } from '../lib/read-failure';

const BITRATES = [96, 128, 160, 192, 256, 320];
const STRENGTH: Record<string, number> = { strong: 1, medium: 0.85, light: 0.65 };

/** Keep about the original's bitrate when saving in its own lossy format. */
function bitrateFor(file: File, seconds: number): number {
  const kbps = (file.size * 8) / Math.max(0.1, seconds) / 1000;
  return BITRATES.find((b) => b >= kbps * 0.95) ?? 320;
}

const voiceNote = (share: number) => (share < 0.05 ? 'no voice found, so most of the sound was treated as noise' : `voice in ${Math.round(share * 100)}% of it`);

void hideUnwritable(document.getElementById('format') as HTMLSelectElement | null);
const longHint = longRecordingHint({ setHint: (text, link) => shell.setHint(text, link) });

const shell = createShell({
  // A phone that locks mid-run stops the page: say so, by name, rather than failing in some step.
  keepAwake: true,
  onFilesChanged: longHint,
  outputFormat: () => str('format', 'same'),
  async process(files, progress) {
    const strength = STRENGTH[radio('strength', 'strong')] ?? 1;
    const choice = str('format', 'same');
    // Copy each file into memory right away: on Android a picked file can become unreadable by the time the noise remover
    // has downloaded. A file the browser cannot reach says so now, before the download.
    files = await Promise.all(files.map(async (entry) => ({ ...entry, file: await snapshotFile(entry.file) })));
    progress.set('Loading the noise remover…', 0.02);
    const rnnoise = await loadRnnoise();
    const cleanFile = async (entry: (typeof files)[number], index: number): Promise<OutputFile> => {
      const file = entry.file;
      const share = (f: number) => (index + f) / files.length;
      let voice = 0;
      const clean = async (chans: Float32Array[], rate: number, audio = false) => {
        try {
          const at48 = await resample(chans, rate, DENOISE_RATE);
          const r = await denoise(rnnoise, at48, strength, (f) => progress.set(`Removing noise from ${file.name}: ${Math.round(f * 100)}%`, share(0.1 + f * 0.6)));
          voice = r.voice;
          return await resample(r.chans, DENOISE_RATE, rate);
        } catch (e) {
          throw inStage('NoiseRemoveError', e, audio);
        }
      };

      progress.set(`Reading the sound of ${file.name}…`, share(0.05));
      if (await hasVideo(file)) {
        const pcm = await decodePcmSliced(file).catch((e) => {
          // A video with no sound track keeps its name (NoSoundTrack) but says what this tool needs.
          if (e instanceof Error && e.name === 'NoSoundTrack') {
            e.message = `${file.name} has no sound to clean.`;
            throw e;
          }
          throw inStage('NoiseDecodeError', e);
        });
        if (!pcm || !pcm[0]?.length) throw audioDecodeError(`${file.name} has no sound to clean.`);
        // The cleaned sound goes straight to the video: no WAV is written and read back whole.
        const r = await addAudio(file, await clean(pcm, SAMPLE_RATE), { mode: 'replace', loop: false, fade: false, onProgress: (f) => progress.set(`Writing ${file.name}: ${Math.round(f * 100)}%`, share(0.7 + f * 0.3)) }).catch((e) => {
          throw inStage('NoiseWriteError', e);
        });
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
          return clean(chans, rate, true);
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
    };
    // A file the phone fails to read part way through is read once more before the failure is shown.
    return processEach(files, progress, 'Cleaning', (entry, index) =>
      retryUnreadable(entry.file, () => cleanFile(entry, index), (message) => progress.set(`${entry.file.name}: ${message}`, (index + 0.05) / files.length)),
    );
  },
});
