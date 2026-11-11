/**
 * Pull still frames out of a video in the browser. Mediabunny (MPL-2.0)
 * reads the container and the browser's own decoder (WebCodecs) decodes just
 * the frames asked for, drawn upright onto canvases that are saved as JPG or
 * PNG. Nothing leaves the tab.
 */
import { requireVideoTrack } from './container-sniff';
import { BlobSource, CanvasSink, Input, MATROSKA, MP4, MPEG_TS, QTFF, WEBM } from 'mediabunny';
import { canvasToBlob } from './image';
import { decodeOrElement, showAt, ELEMENT_FPS, type ElementClip } from './video-fallback';

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
  /** True when the pictures came through the browser's own video player (a <video> element), because WebCodecs could not decode them. */
  viaPlayer?: boolean;
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

/** The same frames, taken by seeking the browser's own player: one picture is held at a time, so a long clip costs no more memory than a short one. */
async function framesFromElement(clip: ElementClip, opts: FramesOptions): Promise<FramesInfo> {
  // The player does not say how many frames a second the clip has: "every frame" is read at the usual 30.
  const times = opts.every === 'all' ? frameTimes(ELEMENT_FPS, 0, clip.duration) : frameTimes(opts.every, 0, clip.duration);
  const estimate = Math.min(opts.limit, times.length);
  const canvas = document.createElement('canvas');
  canvas.width = clip.width;
  canvas.height = clip.height;
  const ctx = canvas.getContext('2d')!;
  let n = 0;
  let capped = false;
  for (const t of times) {
    if (n >= opts.limit) {
      capped = true;
      break;
    }
    await showAt(clip.video, Math.min(t, Math.max(0, clip.duration - 0.001)));
    ctx.drawImage(clip.video, 0, 0, clip.width, clip.height);
    const blob = await canvasToBlob(canvas, opts.type, opts.quality);
    await opts.onFrame({ blob, time: t, canvas }, n, estimate);
    n++;
  }
  return { width: clip.width, height: clip.height, duration: clip.duration, frames: n, capped, viaPlayer: true };
}

export async function extractFrames(file: File, opts: FramesOptions): Promise<FramesInfo> {
  let element: ElementClip | null = null;
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA, MPEG_TS] });
  try {
    const video = await requireVideoTrack(input, file, 'This file has no video this page can read (MP4, MOV, WebM or MKV).');
    // WebCodecs cannot decode it: the browser's own player may (HEVC on a Mac, say). Neither: a class named for the cause.
    element = await decodeOrElement(video, file);
    if (element) return await framesFromElement(element, opts);
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
    element?.dispose();
    input.dispose?.();
  }
}
