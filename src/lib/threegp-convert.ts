/**
 * 3GP to MP4 on the page. Phone-era 3GP files hold H.263 or MPEG-4 video and AMR sound, which browsers
 * have no decoder for, so the file is handed to a worker that loads a decoder built from FFmpeg's
 * libraries (LGPL, libav.js, served from /vendor/ and fetched only now). The worker writes the MP4
 * through Mediabunny; see threegp-decode.worker.ts. H.264 and AAC inside a 3GP are copied as they are.
 */
import { vendorEntry } from './vendor';
import { fromWorkerFailure } from './worker-error';
import { watchEncode } from './encoder-watchdog';
import type { ThreeGpJob, ThreeGpMessage } from './threegp-decode.worker';
import type { ConvertOptions, ConvertResult } from './video-convert';

/** True when the file is an ISO media file ("ftyp" box) whose major brand is 3GPP or 3GPP2 ("3gp4", "3g2a" and the like), whatever its name says. */
export async function isThreeGp(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const tag = (at: number) => String.fromCharCode(...head.subarray(at, at + 4));
  return head.length === 12 && tag(4) === 'ftyp' && tag(8).startsWith('3g');
}

export async function convertThreeGp(file: File, opts: ConvertOptions): Promise<ConvertResult> {
  const worker = new Worker(new URL('./threegp-decode.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await watchEncode<ConvertResult>(
      (progress) =>
        new Promise<ConvertResult>((resolve, reject) => {
          worker.onmessage = (e: MessageEvent<ThreeGpMessage>) => {
            const m = e.data;
            if (m.type === 'progress') {
              progress(m.fraction);
              opts.onProgress?.(m.fraction);
            } else if (m.type === 'done') {
              resolve({
                blob: new Blob([m.buffer], { type: 'video/mp4' }),
                width: m.width,
                height: m.height,
                duration: m.duration,
                videoCodec: m.videoCodec,
                videoCopied: m.videoCopied,
                audio: m.audio,
                audioDropped: !opts.mute && !m.audio,
              });
            } else reject(fromWorkerFailure(m.name, m.message));
          };
          worker.onerror = (e) => reject(new Error(e.message || 'The 3GP decoder stopped unexpectedly.'));
          const job: ThreeGpJob = { file, mute: opts.mute, entry: vendorEntry('libav3gp'), audioEncoder: typeof AudioEncoder !== 'undefined' };
          worker.postMessage(job);
        }),
      () => worker.terminate(),
    );
  } finally {
    worker.terminate();
  }
}
