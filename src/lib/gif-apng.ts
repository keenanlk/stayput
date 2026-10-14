/**
 * GIF to animated PNG, in the page. The GIF is decoded with gifuct-js (MIT) and each frame is
 * composited the way browsers play GIFs (patch placement, disposal, transparency); every finished
 * picture is then written as a full frame by src/lib/apng.ts. Nothing leaves the tab.
 */
import { decompressFrame, type ParsedGif } from 'gifuct-js';
import { encodeApng } from './apng';
import { readGif } from './gif-video';

/** A frame delay of 0 or 10 ms is shown as 100 ms by every browser, so the APNG says the same. */
const frameDelay = (ms: number) => (ms <= 10 ? 100 : ms);

/** The loop count the GIF asked for: 0 forever, a number, or undefined (plays once). */
function loopCount(gif: ParsedGif): number | undefined {
  for (const f of gif.frames as unknown as { application?: { id?: string; blocks?: Uint8Array } }[]) {
    const app = f.application;
    if (app?.id?.startsWith('NETSCAPE') && app.blocks && app.blocks.length >= 3) return app.blocks[1]! | (app.blocks[2]! << 8);
  }
  return undefined;
}

export interface GifToApngResult {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  frames: number;
  /** 0 is forever. */
  plays: number;
  duration: number;
  poster: ImageBitmap;
}

export async function gifToApng(input: ArrayBuffer, onProgress?: (fraction: number) => void): Promise<GifToApngResult> {
  const { gif, frames } = readGif(input);
  const gw = gif.lsd.width;
  const gh = gif.lsd.height;
  const comp = new OffscreenCanvas(gw, gh);
  const cctx = comp.getContext('2d', { willReadFrequently: true })!;
  const patch = new OffscreenCanvas(1, 1);
  const pctx = patch.getContext('2d')!;
  const out: { rgba: Uint8ClampedArray; delayMs: number }[] = [];
  let poster: ImageBitmap | undefined;
  for (const [i, frame] of frames.entries()) {
    const f = decompressFrame(frame, gif.gct, true);
    const { left, top, width: fw, height: fh } = f.dims;
    // Disposal 3 puts back whatever was there before this frame once it has been shown.
    const restore = f.disposalType === 3 ? cctx.getImageData(0, 0, gw, gh) : undefined;
    if (fw > 0 && fh > 0) {
      if (patch.width !== fw || patch.height !== fh) {
        patch.width = fw;
        patch.height = fh;
      }
      pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), fw, fh), 0, 0);
      cctx.drawImage(patch, left, top);
    }
    out.push({ rgba: cctx.getImageData(0, 0, gw, gh).data, delayMs: frameDelay(frame.gce ? (frame.gce.delay || 0) * 10 : 100) });
    if (i === 0) poster = await createImageBitmap(comp);
    if (f.disposalType === 2) cctx.clearRect(left, top, fw, fh);
    else if (restore) cctx.putImageData(restore, 0, 0);
    onProgress?.((i + 1) / (frames.length * 2));
    if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
  }
  const loops = loopCount(gif);
  // No loop extension means the GIF plays once.
  const plays = loops === undefined ? 1 : loops;
  const bytes = await encodeApng({ width: gw, height: gh, frames: out, plays });
  onProgress?.(1);
  return { bytes, width: gw, height: gh, frames: out.length, plays, duration: out.reduce((a, b) => a + b.delayMs, 0), poster: poster! };
}
