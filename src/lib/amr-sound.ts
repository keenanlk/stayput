/**
 * AMR speech as plain samples, for the sound tools and the caption tools. A worker decodes frames (cut by hand from a bare .amr
 * file, see amr-frames.ts, or lifted from the packets of a 3GP or MP4 track) with the libav build the 3GP page ships. The decoder is fetched only when an AMR sound turns up.
 */
import { fromWorkerFailure } from './worker-error';
import { NamedError } from './input-error';
import type { AmrJob, AmrMessage } from './amr-decode.worker';

/** Every frame of `frames` decoded: mono samples and their rate (8000, or 16000 for wide band). */
export async function decodeAmrFrames(frames: Uint8Array[], wide: boolean): Promise<{ samples: Float32Array; rate: number }> {
  if (frames.length === 0) throw new NamedError('AmrDecodeFailed', 'No AMR sound could be read from this file.');
  const lengths = frames.map((f) => f.length);
  const bytes = new Uint8Array(lengths.reduce((a, b) => a + b, 0));
  let at = 0;
  for (const f of frames) (bytes.set(f, at), (at += f.length));
  // Loaded here: tests import the audio helpers in Node, which cannot read vendor.json.
  const { vendorEntry } = await import('./vendor');
  const worker = new Worker(new URL('./amr-decode.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<AmrMessage>) => (e.data.type === 'done' ? resolve({ samples: e.data.samples, rate: e.data.rate }) : reject(fromWorkerFailure(e.data.name, e.data.message)));
      worker.onerror = (e) => reject(new NamedError('AmrDecodeFailed', e.message || 'The AMR decoder stopped unexpectedly.'));
      const job: AmrJob = { entry: vendorEntry('libav3gp'), wide, bytes, lengths };
      worker.postMessage(job, [bytes.buffer]);
    });
  } finally {
    worker.terminate();
  }
}
