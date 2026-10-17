/**
 * Animated PNG (APNG) to GIF, in the page. UPNG.js (MIT) decodes the APNG and composites each frame
 * with its dispose and blend rules; gifenc (MIT) writes every finished picture as a GIF frame with its
 * own 256-colour palette and 1-bit transparency. Nothing leaves the tab.
 */
import UPNG from 'upng-js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { overPhoneLimit } from './phone-limit';
import { UnreadableFile, NamedError } from './input-error';

export class NotAnApng extends Error {
  constructor(still: boolean) {
    super(
      still
        ? 'This PNG is not animated, so there is nothing to turn into a GIF. For one picture, use PNG to JPG (/png-to-jpg), or build a GIF from several pictures with GIF maker (/tools/gif-maker).'
        : 'This file is not a PNG. Drop an animated PNG (.png or .apng).',
    );
    this.name = still ? 'StillPng' : 'NotAnApng';
  }
}

export interface ApngToGifResult {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  frames: number;
  /** Total plays as the APNG says it: 0 is forever. */
  plays: number;
  duration: number;
}

const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** The GIF NETSCAPE repeat count: 0 forever, N-1 for N plays, -1 (no block) for one play. */
export const gifRepeat = (plays: number) => (plays === 0 ? 0 : plays === 1 ? -1 : plays - 1);

// Not in the typings: turns one frame's raw bytes into RGBA at the frame's own size.
const decodeImage = (UPNG.toRGBA8 as unknown as { decodeImage(d: Uint8Array, w: number, h: number, o: Decoded): Uint8Array }).decodeImage;

type Decoded = ReturnType<typeof UPNG.decode>;
type Rect = { x: number; y: number; width: number; height: number };

/** Draw a frame's pixels onto the canvas: source copies them, over blends them on top (non-premultiplied). */
function draw(canvas: Uint8Array, cw: number, tile: Uint8Array, r: Rect, over: boolean) {
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const s = (y * r.width + x) * 4;
      const o = ((r.y + y) * cw + r.x + x) * 4;
      const sa = tile[s + 3]!;
      if (!over || sa === 255) {
        canvas.set(tile.subarray(s, s + 4), o);
      } else if (sa > 0) {
        const da = canvas[o + 3]!;
        const a = sa + (da * (255 - sa)) / 255;
        for (let k = 0; k < 3; k++) canvas[o + k] = Math.round((tile[s + k]! * sa + (canvas[o + k]! * da * (255 - sa)) / 255) / a);
        canvas[o + 3] = Math.round(a);
      }
    }
  }
}

/**
 * Whole pictures, one at a time. UPNG.toRGBA8 restores the wrong picture after a "previous" disposal
 * that follows a "background" one, so the frames are composited here by the APNG rules: dispose the
 * last frame (a first frame's "previous" counts as "background"), then draw this one.
 */
function* pictures(img: Decoded): Generator<Uint8Array> {
  const { width: w, height: h } = img;
  const canvas = new Uint8Array(w * h * 4);
  let last: { rect: Rect; dispose: number; saved?: Uint8Array } | undefined;
  for (const [i, f] of img.frames.entries()) {
    if (last) {
      if (last.dispose === 2 && last.saved) canvas.set(last.saved);
      else if (last.dispose !== 0) draw(canvas, w, new Uint8Array(last.rect.width * last.rect.height * 4), last.rect, false);
    }
    const dispose = i === 0 && f.dispose === 2 ? 1 : f.dispose;
    last = { rect: f.rect, dispose, saved: dispose === 2 ? canvas.slice() : undefined };
    const tile = decodeImage(((f as { data?: Uint8Array }).data ?? img.data) as Uint8Array, f.rect.width, f.rect.height, img);
    draw(canvas, w, tile, f.rect, f.blend === 1 && i > 0);
    yield canvas;
  }
}

export async function apngToGif(input: ArrayBuffer, onProgress?: (fraction: number) => void): Promise<ApngToGifResult> {
  const src = new Uint8Array(input);
  if (!isPng(src)) throw new NotAnApng(false);
  let img: ReturnType<typeof UPNG.decode>;
  try {
    img = UPNG.decode(input);
  } catch {
    throw new UnreadableFile('This PNG is damaged and could not be read.');
  }
  if (!img.tabs.acTL || img.frames.length < 2) throw new NotAnApng(true);
  // Every frame is held whole while it is converted, so a phone is held to the same budget as video.
  if (overPhoneLimit(img.width * img.height * 4 * img.frames.length)) {
    throw new NamedError('ApngToGifFailed', `This animation is ${img.width}×${img.height} with ${img.frames.length} frames, which is more than a phone can hold in memory. Try a computer.`);
  }
  const plays = img.tabs.acTL.num_plays;
  const repeat = gifRepeat(plays);
  const count = img.frames.length;
  const gif = GIFEncoder();
  let duration = 0;
  let i = 0;
  for (const px of pictures(img)) {
    const palette = quantize(px, 256, { format: 'rgba4444', oneBitAlpha: true });
    const index = applyPalette(px, palette, 'rgba4444');
    const t = palette.findIndex((c) => c[3] === 0);
    // Browsers play delays under 20 ms at 100 ms, so floor them at 20.
    const delay = Math.max(20, Math.round(img.frames[i]!.delay || 0));
    duration += delay;
    // Frames are whole pictures, so each one is disposed to background and transparent areas stay clear.
    gif.writeFrame(index, img.width, img.height, { palette, delay, repeat, dispose: 2, transparent: t >= 0, transparentIndex: Math.max(0, t) });
    onProgress?.((i + 1) / count);
    if (i++ % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  return { bytes: gif.bytes() as Uint8Array<ArrayBuffer>, width: img.width, height: img.height, frames: count, plays, duration };
}
