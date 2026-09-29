import { createShell, processEach, radio, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { channelsOf, decodeAudio, formatDuration } from '../lib/audio';
import { clean, cutPoints, toSrt, toText, toVtt, type Segment } from '../lib/captions';
import type { Reply, Request } from '../lib/transcribe.worker';

/**
 * Transcribe speech in an audio or video file to text or subtitles. The sound
 * is decoded in the tab at 16 kHz mono, cut at pauses into pieces of up to 28
 * seconds, and each piece goes to Whisper in a worker
 * (src/lib/transcribe.worker.ts). Nothing is uploaded.
 */

const RATE = 16000;

let worker: Worker | undefined;
let nextId = 0;
function recognise(audio: Float32Array, language: string | null, task: Request['task'], onLoading: (f: number) => void): Promise<{ chunks: Segment[]; language: string }> {
  worker ??= new Worker(new URL('../lib/transcribe.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<Reply>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'loading') return onLoading(msg.fraction);
      done();
      if (msg.type === 'result') resolve({ chunks: msg.chunks, language: msg.language });
      else reject(new Error(msg.message));
    };
    const onError = (e: ErrorEvent) => {
      done();
      worker = undefined;
      w.terminate();
      reject(new Error(e.message || 'The speech model stopped unexpectedly.'));
    };
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, audio, language, task } satisfies Request, [audio.buffer]);
  });
}

const NAMES = new Intl.DisplayNames(['en'], { type: 'language' });
const EXT = { txt: 'txt', srt: 'srt', vtt: 'vtt' } as const;
const TYPE = { txt: 'text/plain', srt: 'application/x-subrip', vtt: 'text/vtt' } as const;

createShell({
  outputFormat: () => str('format', 'txt'),
  async process(files, progress) {
    const language = str('language', 'auto');
    const task = radio('task', 'transcribe') as Request['task'];
    const format = str('format', 'txt') as keyof typeof EXT;
    let modelReady = false;
    return processEach(files, progress, 'Transcribing', async (entry, index) => {
      const file = entry.file;
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading the sound from ${file.name}…`, share(0.02));
      const [samples] = channelsOf(await decodeAudio(file, RATE), true);
      const total = samples!.length / RATE;
      if (total < 0.5) throw new Error('The recording is too short to hold any speech.');
      const cuts = [0, ...cutPoints(samples!, RATE), samples!.length];
      const segments: Segment[] = [];
      // Detected once, from the first piece, then kept for the rest of the recording.
      let spoken: string | null = language === 'auto' ? null : language;
      for (let i = 1; i < cuts.length; i++) {
        const from = cuts[i - 1]!;
        const at = from / RATE;
        progress.set(`Transcribing ${file.name}: ${formatDuration(at)} of ${formatDuration(total)}`, share(0.05 + 0.95 * (at / total)));
        // A copy, because the samples are handed over to the worker.
        const piece = samples!.slice(from, cuts[i]);
        const found = await recognise(piece, spoken, task, (f) => {
          if (!modelReady) progress.set(`Downloading the speech model, once (76 MB): ${Math.round(f * 100)}%`, share(0.05 * f));
        });
        modelReady = true;
        spoken = found.language;
        segments.push(...found.chunks.map((s) => ({ start: s.start + at, end: s.end + at, text: s.text })));
      }
      const tidy = clean(segments);
      if (tidy.length === 0) throw new Error('No speech was found in this recording.');
      const body = format === 'srt' ? toSrt(tidy) : format === 'vtt' ? toVtt(tidy) : toText(tidy);
      // Chinese, Japanese and Thai are written without spaces, so count characters there.
      const unspaced = ['zh', 'ja', 'th', 'lo', 'my', 'km'].includes(spoken!);
      const count = unspaced ? tidy.reduce((n, s) => n + s.text.replace(/\s/g, '').length, 0) : tidy.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
      const amount = `${count.toLocaleString('en')} ${unspaced ? 'characters' : 'words'}`;
      const out: OutputFile = {
        name: suffixName(file.name, task === 'translate' ? '-english' : '', EXT[format]),
        blob: new Blob([body], { type: `${TYPE[format]};charset=utf-8` }),
        originalSize: file.size,
        note: `${formatDuration(total)} of ${NAMES.of(spoken!) ?? spoken} speech, ${amount}${format === 'txt' ? '' : ` in ${tidy.length} captions`}`,
        text: body,
      };
      return out;
    });
  },
  resultsTitle: () => 'Transcript',
});
