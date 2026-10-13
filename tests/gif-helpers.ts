import { parseGIF, decompressFrame } from 'gifuct-js';

/** Helpers for specs that build animated GIFs in Node and read the ones the site writes. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Shown {
  width: number;
  height: number;
  /** The loop count in the NETSCAPE block, or undefined when the GIF has none (it plays once). */
  loop: number | undefined;
  /** Each frame's delay in milliseconds, as a browser reads it from the file. */
  delays: number[];
  /** Each frame as a browser shows it: composited on the GIF's screen, RGBA. */
  frames: Uint8ClampedArray[];
}

/** Frames in RGBA at the GIF's size; `transparent` makes alpha-0 pixels transparent. Delays are in milliseconds. */
export async function gifFrom(o: { w: number; h: number; frames: { rgba: Uint8Array }[]; delays: number[]; repeat: number; transparent?: boolean }): Promise<Uint8Array> {
  // gifenc's Node build is CommonJS, so its functions arrive on the default export.
  const mod = await import('gifenc');
  const { GIFEncoder, quantize, applyPalette } = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const gif = GIFEncoder();
  for (const [i, f] of o.frames.entries()) {
    if (o.transparent) {
      const palette = quantize(f.rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
      const index = applyPalette(f.rgba, palette, 'rgba4444');
      const t = palette.findIndex((c) => c[3] === 0);
      gif.writeFrame(index, o.w, o.h, { palette, delay: o.delays[i % o.delays.length]!, repeat: o.repeat, transparent: t >= 0, transparentIndex: Math.max(0, t), dispose: 2 });
    } else {
      const palette = quantize(f.rgba, 256);
      gif.writeFrame(applyPalette(f.rgba, palette), o.w, o.h, { palette, delay: o.delays[i % o.delays.length]!, repeat: o.repeat });
    }
  }
  gif.finish();
  return gif.bytes();
}

/** Decode a GIF the way a browser plays it: patches composited in order, honouring each frame's disposal. */
export function readGif(bytes: Uint8Array): Shown {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gif = parseGIF(buffer);
  const w = gif.lsd.width;
  const h = gif.lsd.height;
  const screen = new Uint8ClampedArray(w * h * 4);
  const frames: Uint8ClampedArray[] = [];
  const delays: number[] = [];
  for (const raw of gif.frames) {
    if (!('image' in raw)) continue;
    const f = decompressFrame(raw, gif.gct, true);
    const { left, top, width, height } = f.dims;
    const before = f.disposalType === 3 ? screen.slice() : undefined;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = (y * width + x) * 4;
        if (f.patch[s + 3] === 0) continue;
        screen.set(f.patch.subarray(s, s + 4), ((top + y) * w + left + x) * 4);
      }
    }
    frames.push(screen.slice());
    // gifuct-js reports a stored delay of 0 as 100 ms; read the number in the file.
    delays.push(((raw as unknown as { gce?: { delay?: number } }).gce?.delay ?? 0) * 10);
    if (f.disposalType === 2) {
      for (let y = 0; y < height; y++) screen.fill(0, ((top + y) * w + left) * 4, ((top + y) * w + left + width) * 4);
    } else if (before) screen.set(before);
  }
  // NETSCAPE2.0, then 03 01 and the count, little-endian.
  const at = Buffer.from(bytes).indexOf('NETSCAPE2.0');
  const loop = at >= 0 ? bytes[at + 11 + 2]! | (bytes[at + 11 + 3]! << 8) : undefined;
  return { width: w, height: h, loop, delays, frames };
}

/** How many pixels of a frame are near white and opaque inside the rectangle (in pixels). */
export function whiteIn(frame: Uint8ClampedArray, width: number, r: Rect): number {
  let n = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const q = (y * width + x) * 4;
      if (frame[q]! >= 225 && frame[q + 1]! >= 225 && frame[q + 2]! >= 225 && frame[q + 3] === 255) n++;
    }
  }
  return n;
}
