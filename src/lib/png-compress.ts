/**
 * PNG compression in the browser with UPNG.js (MIT, by Photopea). The PNG is
 * decoded to exact RGBA pixels (no canvas, so no premultiplied-alpha rounding),
 * then written again either with its colours reduced to a palette of up to N
 * (lossy, the TinyPNG approach: typically 60 to 80 percent smaller, with
 * transparency kept) or with the same pixels and better filtering and colour
 * type (lossless). Animated PNGs keep every frame. Nothing leaves the tab.
 */
import UPNG from 'upng-js';

export interface PngResult {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  frames: number;
  /** True when the output was not smaller, so the original bytes are returned. */
  keptOriginal: boolean;
}

const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** `colors` is the palette size (2 to 256) for lossy compression, or 0 for lossless. */
export function compressPng(input: ArrayBuffer, colors: number): PngResult {
  const original = new Uint8Array(input) as Uint8Array<ArrayBuffer>;
  if (!isPng(original)) throw new Error('This file is not a PNG. For JPG, WebP and other photos, use Compress image.');
  let img: ReturnType<typeof UPNG.decode>;
  try {
    img = UPNG.decode(input);
  } catch {
    throw new Error('This PNG is damaged and could not be read.');
  }
  const frames = UPNG.toRGBA8(img);
  const delays = img.frames.length > 1 ? img.frames.map((f) => f.delay) : undefined;
  const out = new Uint8Array(UPNG.encode(frames, img.width, img.height, colors, delays));
  const keptOriginal = out.length >= original.length;
  return { bytes: keptOriginal ? original : out, width: img.width, height: img.height, frames: frames.length, keptOriginal };
}
