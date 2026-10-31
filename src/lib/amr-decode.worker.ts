/**
 * Decodes AMR speech (the voice format of some Android recorders) in a background worker, with the decoder from the libav build
 * the 3GP page ships (FFmpeg's libraries, LGPL, fetched from /vendor/ only when this runs). The page hands over the frames
 * already cut out of the file, each starting with its header byte; this lifts them through the decoder and posts the sound back
 * as mono samples at the codec's own rate (8 kHz, or 16 kHz wide band).
 */
import { toFloatPlanes, type LibavAudioFrame } from './libav-audio';
import { ThreeGpDecoderLoadError } from './threegp-errors';
import { workerFailure } from './worker-error';

export interface AmrJob {
  /** URL of the libav.js loader module (under /vendor/). */
  entry: string;
  wide: boolean;
  /** Every frame's bytes, one after the other. */
  bytes: Uint8Array;
  /** Each frame's length in `bytes`. */
  lengths: number[];
}

export type AmrMessage = { type: 'done'; samples: Float32Array; rate: number } | { type: 'error'; name: string; message: string };

/** Frames per call into the decoder: enough to keep calls few, few enough to keep each reply small. */
const BATCH = 1500;

// The libav.js API is large and untyped here; the calls used are the ones in threegp-decode.worker.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Libav = any;

async function loadLibav(entry: string): Promise<Libav> {
  try {
    const mod = await import(/* @vite-ignore */ entry);
    const base = entry.slice(0, entry.lastIndexOf('/'));
    return await mod.default.LibAV({ noworker: true, base });
  } catch (cause) {
    throw new ThreeGpDecoderLoadError(cause);
  }
}

async function decode(job: AmrJob): Promise<AmrMessage> {
  const libav = await loadLibav(job.entry);
  const [, c, pkt, frame] = await libav.ff_init_decoder(job.wide ? 'amrwb' : 'amrnb');
  const rate = job.wide ? 16000 : 8000;
  const parts: Float32Array[] = [];
  let total = 0;
  const take = (frames: LibavAudioFrame[]) => {
    for (const f of frames) {
      const [first] = toFloatPlanes(f);
      if (!first?.length) continue;
      parts.push(first);
      total += first.length;
    }
  };
  let at = 0;
  for (let i = 0; i < job.lengths.length; i += BATCH) {
    const packets = job.lengths.slice(i, i + BATCH).map((n, k) => {
      const data = job.bytes.subarray(at, at + n);
      at += n;
      // 20 ms a frame; the decoder needs a stamp, not a true one.
      return { data, pts: (i + k) * (rate / 50), ptshi: 0 };
    });
    take(await libav.ff_decode_multi(c, pkt, frame, packets, { ignoreErrors: true }));
  }
  take(await libav.ff_decode_multi(c, pkt, frame, [], { fin: true, ignoreErrors: true }));
  const samples = new Float32Array(total);
  let o = 0;
  for (const p of parts) (samples.set(p, o), (o += p.length));
  return { type: 'done', samples, rate };
}

self.onmessage = (e: MessageEvent<AmrJob>) => {
  decode(e.data).then(
    (m) => (self as unknown as Worker).postMessage(m, [(m as { samples: Float32Array }).samples.buffer]),
    (err) => {
      const f = workerFailure(err, 'AmrDecodeFailed');
      (self as unknown as Worker).postMessage({ type: 'error', name: f.name, message: f.message } satisfies AmrMessage);
    },
  );
};
