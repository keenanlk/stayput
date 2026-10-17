/**
 * AVI to MP4 on the page. An AVI is a container browsers do not open, and its usual video
 * (Xvid, DivX, Motion JPEG) has no WebCodecs decoder, so the file is handed to a worker that loads
 * a decoder built from FFmpeg's libraries (LGPL, libav.js, served from /vendor/ and fetched only
 * now). The worker decodes and writes the MP4 through Mediabunny; see avi-decode.worker.ts.
 */
import { vendorEntry } from './vendor';
import { fromWorkerFailure } from './worker-error';
import { watchEncode } from './encoder-watchdog';
import type { AviJob, AviMessage } from './avi-decode.worker';
import type { ConvertOptions, ConvertResult } from './video-convert';
import { NamedError } from './input-error';

/** True when the file starts like an AVI (RIFF, then "AVI "), whatever its name says. */
export async function isAvi(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const tag = (at: number) => String.fromCharCode(...head.subarray(at, at + 4));
  return head.length === 12 && tag(0) === 'RIFF' && tag(8) === 'AVI ';
}

export async function convertAvi(file: File, opts: ConvertOptions): Promise<ConvertResult> {
  const worker = new Worker(new URL('./avi-decode.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await watchEncode<ConvertResult>(
      (progress) =>
        new Promise<ConvertResult>((resolve, reject) => {
          worker.onmessage = (e: MessageEvent<AviMessage>) => {
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
                videoCopied: false,
                audio: m.audio,
                audioDropped: !opts.mute && !m.audio,
              });
            } else reject(fromWorkerFailure(m.name, m.message));
          };
          worker.onerror = (e) => reject(new NamedError('AviConvertFailed', e.message || 'The AVI decoder stopped unexpectedly.'));
          const job: AviJob = { file, mute: opts.mute, entry: vendorEntry('libav'), audioEncoder: typeof AudioEncoder !== 'undefined' };
          worker.postMessage(job);
        }),
      () => worker.terminate(),
    );
  } finally {
    worker.terminate();
  }
}
