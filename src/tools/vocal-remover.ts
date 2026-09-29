import { createShell, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { SAMPLE_RATE, decodeAudio, encodeMp3, encodeWav, formatDuration } from '../lib/audio';
import type { Reply, Request } from '../lib/vocals.worker';

/**
 * Vocal remover: split a song into the instrumental (karaoke) and the vocals
 * (acapella) with an MDX-Net model running in a worker
 * (src/lib/vocals.worker.ts). The instrumental is what the model hears as
 * music; the vocals are the song minus that. Nothing is uploaded.
 */

let worker: Worker | undefined;
let nextId = 0;
let modelReady = false;

function split(left: Float32Array, right: Float32Array, onLoading: (f: number) => void, onPiece: (done: number, total: number, engine: 'gpu' | 'cpu') => void) {
  worker ??= new Worker(new URL('../lib/vocals.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  return new Promise<{ left: Float32Array; right: Float32Array; engine: 'gpu' | 'cpu' }>((resolve, reject) => {
    const onMessage = (e: MessageEvent<Reply>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'loading') return onLoading(msg.fraction);
      if (msg.type === 'progress') return onPiece(msg.done, msg.total, msg.engine);
      done();
      if (msg.type === 'done') resolve(msg);
      else reject(new Error(msg.message));
    };
    const onError = (e: ErrorEvent) => {
      done();
      worker = undefined;
      w.terminate();
      reject(new Error(e.message || 'The separation model stopped unexpectedly. The song may be too long for this device’s memory.'));
    };
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, left, right, gpu: true } satisfies Request, [left.buffer, right.buffer]);
  });
}

const minutes = (s: number) => (s < 90 ? 'about a minute' : `about ${Math.round(s / 60)} minutes`);

createShell({
  outputFormat: () => str('format', 'mp3'),
  async process(files, progress) {
    const stems = str('stems', 'instrumental');
    const format = str('format', 'mp3') === 'wav' ? 'wav' : 'mp3';
    const outputs: OutputFile[] = [];
    for (const [index, entry] of files.entries()) {
      const file = entry.file;
      const share = (f: number) => (index + f) / files.length;
      progress.set(`Reading ${file.name}…`, share(0.01));
      const buffer = await decodeAudio(file, SAMPLE_RATE);
      const mixL = buffer.getChannelData(0).slice();
      const mixR = (buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)).slice();
      const seconds = mixL.length / SAMPLE_RATE;
      if (seconds < 1) throw new Error(`${file.name} is too short to separate.`);
      const started = performance.now();
      let firstPieceAt = 0;
      const res = await split(
        mixL.slice(),
        mixR.slice(),
        (f) => {
          if (!modelReady) progress.set(`Downloading the separation model, once (67 MB): ${Math.round(f * 100)}%`, share(0.02 + 0.08 * f));
        },
        (done, total, engine) => {
          modelReady = true;
          if (done === 0) {
            firstPieceAt = performance.now();
            progress.set(`Separating ${file.name}${engine === 'cpu' ? ' on the CPU (no WebGPU in this browser), which is slow' : ''}…`, share(0.1));
            return;
          }
          const each = (performance.now() - (firstPieceAt || started)) / done / 1000;
          const left = Math.round(each * (total - done));
          progress.set(`Separating ${file.name}: ${Math.round((done / total) * 100)}%${done < total ? `, ${minutes(left)} left` : ''}`, share(0.1 + 0.8 * (done / total)));
        },
      );
      const inst = [res.left, res.right];
      const voc = [mixL.map((v, i) => v - res.left[i]! / 1.022), mixR.map((v, i) => v - res.right[i]! / 1.022)];
      const wanted: [string, Float32Array[]][] = [];
      if (stems !== 'vocals') wanted.push(['instrumental', inst]);
      if (stems !== 'instrumental') wanted.push(['vocals', voc]);
      for (const [name, chans] of wanted) {
        progress.set(`Saving the ${name}…`, share(0.92));
        const blob = format === 'wav' ? encodeWav(chans) : await encodeMp3(chans, 320, (f) => progress.set(`Saving the ${name}: ${Math.round(f * 100)}%`, share(0.9 + 0.1 * f)));
        outputs.push({
          name: suffixName(file.name, `-${name}`, format),
          blob,
          originalSize: file.size,
          note: `${name === 'vocals' ? 'vocals only (acapella)' : 'music without the vocals'}, ${formatDuration(seconds)}, ${format === 'wav' ? 'WAV' : 'MP3 320 kbps'}, separated in ${formatDuration((performance.now() - started) / 1000)} on the ${res.engine === 'gpu' ? 'GPU' : 'CPU'}`,
        });
      }
    }
    return outputs;
  },
});
