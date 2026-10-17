/**
 * FLV to MP4 on the page. No browser opens FLV, so the file goes to a worker that reads the container
 * with a build of FFmpeg's libavformat (LGPL, libav.js, served from /vendor/ and fetched only now).
 * H.264 pictures and AAC sound are copied into the MP4 as they are; MP3 sound is decoded and written as
 * AAC. See flv-decode.worker.ts.
 */
import { vendorEntry } from './vendor';
import { fromWorkerFailure } from './worker-error';
import { watchEncode } from './encoder-watchdog';
import type { FlvJob, FlvMessage } from './flv-decode.worker';
import type { ConvertOptions, ConvertResult } from './video-convert';
import { NamedError } from './input-error';

/** True when the file starts with the FLV signature ("FLV", version 1), whatever its name says. */
export async function isFlv(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head.length === 4 && head[0] === 0x46 && head[1] === 0x4c && head[2] === 0x56 && head[3] === 1;
}

export async function convertFlv(file: File, opts: ConvertOptions): Promise<ConvertResult> {
  const worker = new Worker(new URL('./flv-decode.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await watchEncode<ConvertResult>(
      (progress) =>
        new Promise<ConvertResult>((resolve, reject) => {
          worker.onmessage = (e: MessageEvent<FlvMessage>) => {
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
                videoCodec: 'H.264',
                videoCopied: true,
                audio: m.audio,
                audioDropped: !opts.mute && !m.audio,
              });
            } else reject(fromWorkerFailure(m.name, m.message));
          };
          worker.onerror = (e) => reject(new NamedError('FlvConvertFailed', e.message || 'The FLV reader stopped unexpectedly.'));
          const job: FlvJob = { file, mute: opts.mute, entry: vendorEntry('libavFlv'), audioEncoder: typeof AudioEncoder !== 'undefined' };
          worker.postMessage(job);
        }),
      () => worker.terminate(),
    );
  } finally {
    worker.terminate();
  }
}
