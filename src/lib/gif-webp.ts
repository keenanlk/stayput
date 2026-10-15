/**
 * GIF to animated WebP, in the page. The GIF is decoded and composited by gif-apng.ts (gifuct-js,
 * MIT); each finished picture is encoded as a still WebP by the jSquash encoder (libwebp,
 * Apache-2.0 / BSD), loaded from this site on the first run, and src/lib/webp-mux.ts wraps the
 * frames in an animated WebP. Browsers cannot write animated WebP, and Safari cannot write WebP
 * at all, so the same code path serves every browser. Nothing leaves the tab.
 */
import { gifPictures } from './gif-apng';
import { loadWebpEncoder } from './image';
import { muxAnimatedWebp } from './webp-mux';
import { DamagedGif, explain } from './gif-errors';
import { NamedError } from './input-error';

export interface GifToWebpOptions {
  lossless: boolean;
  /** 0..100, lossy only. */
  quality: number;
  onProgress?: (fraction: number) => void;
}

export interface GifToWebpResult {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  frames: number;
  /** 0 is forever. */
  plays: number;
  duration: number;
  poster: ImageBitmap;
}

export async function gifToWebp(input: ArrayBuffer, opts: GifToWebpOptions): Promise<GifToWebpResult> {
  // Decoding is the cheap half; the encoder is fetched only after the GIF is known to be readable.
  // A GIF the parser chokes on (cut short, bad block) is a damaged GIF; out-of-memory kinds are GifTooLarge.
  const pics = await gifPictures(input, (f) => opts.onProgress?.(f * 0.1)).catch((e) => {
    const x = explain(e);
    throw x instanceof Error && x.name !== 'Error' && x.name !== 'TypeError' ? x : new DamagedGif();
  });
  try {
    const { module, defaults } = await loadWebpEncoder().catch((e) => {
      throw new NamedError('WebpEncoderLoadError', e instanceof Error ? e.message : 'The WebP encoder could not be loaded. Check your connection and try again.');
    });
    const options = opts.lossless
      ? { ...defaults, lossless: 1, exact: 1, quality: 75, method: 4 }
      : { ...defaults, lossless: 0, quality: Math.round(Math.min(100, Math.max(0, opts.quality))) };
    const frames: { webp: Uint8Array; delayMs: number }[] = [];
    for (const [i, f] of pics.frames.entries()) {
      const webp = module.encode(f.rgba, pics.width, pics.height, options);
      if (!webp) throw new NamedError('WebpFrameEncodeError', 'The browser could not encode a frame.');
      // The encoder's output lives in WebAssembly memory it may reuse; keep our own copy.
      frames.push({ webp: webp.slice(), delayMs: f.delayMs });
      opts.onProgress?.(0.1 + (0.9 * (i + 1)) / pics.frames.length);
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    // A GIF loop count N means N repeats after the first play (N + 1 plays); WebP counts total plays.
    // 0 is forever in both, and a GIF with no loop setting plays once.
    const plays = pics.loop === undefined ? 1 : pics.loop === 0 ? 0 : pics.loop + 1;
    const bytes = muxAnimatedWebp({ width: pics.width, height: pics.height, frames, loops: plays });
    return { bytes, width: pics.width, height: pics.height, frames: frames.length, plays, duration: frames.reduce((a, b) => a + b.delayMs, 0), poster: pics.poster };
  } catch (e) {
    pics.poster.close();
    throw e;
  }
}
