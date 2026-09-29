/**
 * Pull still frames out of a video in the browser. Mediabunny (MPL-2.0)
 * reads the container and the browser's own decoder (WebCodecs) decodes just
 * the frames asked for, drawn upright onto canvases that are saved as JPG or
 * PNG. Nothing leaves the tab.
 */
import { BlobSource, CanvasSink, Input, MATROSKA, MP4, QTFF, WEBM } from 'mediabunny';
import { canvasToBlob } from './image';
import { unplayable } from './video-compress';

/** 'all' for every frame, a number for that many frames a second, or 'spread:N' for N frames across the video. */
export type FrameEvery = 'all' | number | `spread:${number}`;

export interface Frame {
  blob: Blob;
  /** Seconds from the start. */
  time: number;
  canvas: HTMLCanvasElement | OffscreenCanvas;
}

export interface FramesOptions {
  every: FrameEvery;
  type: 'image/jpeg' | 'image/png';
  quality?: number;
  /** Stop after this many frames. */
  limit: number;
  onFrame: (frame: Frame, index: number, estimate: number) => Promise<void> | void;
}

export interface FramesInfo {
  width: number;
  height: number;
  duration: number;
  frames: number;
  /** True when the limit stopped the extraction early. */
  capped: boolean;
}

/** The times to take frames at, for a video that starts at `first` and lasts `duration` seconds. */
export function frameTimes(every: Exclude<FrameEvery, 'all'>, first: number, duration: number): number[] {
  if (typeof every === 'string') {
    const n = Math.max(1, Math.floor(Number(every.slice(7))));
    // The middle of each of n equal slices, so the first and last frames are not black fades.
    return Array.from({ length: n }, (_, i) => first + ((i + 0.5) * duration) / n);
  }
  const step = 1 / every;
  const out: number[] = [];
  for (let t = 0; t < duration - 1e-6; t += step) out.push(first + t);
  return out;
}

export async function extractFrames(file: File, opts: FramesOptions): Promise<FramesInfo> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new Error('This file has no video this page can read (MP4, MOV, WebM or MKV).');
    if (!(await video.canDecode())) throw new Error(unplayable());
    const first = await video.getFirstTimestamp();
    const duration = Math.max(0, (await video.computeDuration()) - first);
    const stats = await video.computePacketStats(200).catch(() => null);
    const fps = stats?.averagePacketRate || 30;
    const sink = new CanvasSink(video);
    const times = opts.every === 'all' ? null : frameTimes(opts.every, first, duration);
    const estimate = Math.min(opts.limit, times ? times.length : Math.round(duration * fps));
    const iter = times ? sink.canvasesAtTimestamps(times) : sink.canvases();
    let n = 0;
    let capped = false;
    let lastTime = -Infinity;
    for await (const wrapped of iter) {
      if (!wrapped) continue;
      // Two requested times in one long frame give the same picture; keep one.
      if (wrapped.timestamp === lastTime) continue;
      lastTime = wrapped.timestamp;
      if (n >= opts.limit) {
        capped = true;
        break;
      }
      const blob = await canvasToBlob(wrapped.canvas, opts.type, opts.quality);
      await opts.onFrame({ blob, time: Math.max(0, wrapped.timestamp - first), canvas: wrapped.canvas }, n, estimate);
      n++;
    }
    return { width: video.displayWidth, height: video.displayHeight, duration, frames: n, capped };
  } finally {
    input.dispose?.();
  }
}
