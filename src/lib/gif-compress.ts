/**
 * Make an animated GIF smaller, in the page. The GIF is decoded with
 * gifuct-js (MIT) and every frame is composited the way browsers play it.
 * Frames are then written back with gifenc's (MIT) colour quantizer and LZW
 * coder, using the tricks GIF optimizers such as gifsicle use:
 *
 * - each frame after the first stores only the rectangle that changed, and
 *   pixels inside it that did not change are transparent, which LZW squeezes
 *   to almost nothing;
 * - "lossy" levels also treat pixels that barely changed as unchanged, and
 *   use fewer colours;
 * - frames can be scaled down, and every second or third frame dropped (its
 *   time is added to the frame before, so the GIF plays at the same speed).
 *
 * GIFs with transparent areas cannot use the unchanged-pixel trick (a
 * transparent pixel would show the frame underneath), so their frames are
 * stored whole. Nothing leaves the tab.
 */
import { parseGIF, decompressFrame, type ParsedGif } from 'gifuct-js';
import { quantize, applyPalette, type Palette } from 'gifenc';
import lzwEncode from 'gifenc/src/lzwEncode.js';

type GifFrame = Parameters<typeof decompressFrame>[0];

export type GifLevel = 'light' | 'medium' | 'strong';

export interface GifCompressOptions {
  level: GifLevel;
  /** 1 keeps the size; 0.5 halves both sides. */
  scale: number;
  /** Keep every frame (1), every second (2) or every third (3). */
  keepEvery: number;
  /** Draw every frame into an exact box instead of scaling: fitted inside (transparent bars) or cropped around the centre. */
  box?: { width: number; height: number; fit: 'contain' | 'cover' };
  /** Always return the rewritten GIF, even if it is not smaller than the input. */
  force?: boolean;
  onProgress?: (fraction: number) => void;
}

export interface GifCompressResult {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  framesIn: number;
  framesOut: number;
  /** True when no setting made the file smaller and the original is returned. */
  unchanged: boolean;
}

const LEVELS: Record<GifLevel, { colors: number; fuzz: number }> = {
  light: { colors: 256, fuzz: 0 },
  medium: { colors: 128, fuzz: 14 },
  strong: { colors: 64, fuzz: 30 },
};

/** Browsers play delays of 10 ms or less at 100 ms; keep that behaviour. */
const frameDelay = (ms: number) => (ms <= 10 ? 100 : ms);

interface OutFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  palette: Palette;
  index: Uint8Array;
  transparentIndex: number;
  dispose: number;
  delay: number;
}

/** The loop count the GIF asked for: 0 forever, a number, or undefined to play once. */
function loopCount(gif: ParsedGif): number | undefined {
  for (const f of gif.frames as unknown as { application?: { id?: string; blocks?: Uint8Array } }[]) {
    const app = f.application;
    if (app?.id?.startsWith('NETSCAPE') && app.blocks && app.blocks.length >= 3) return app.blocks[1]! | (app.blocks[2]! << 8);
  }
  return undefined;
}

export async function compressGif(input: ArrayBuffer, opts: GifCompressOptions): Promise<GifCompressResult> {
  const head = new Uint8Array(input, 0, Math.min(6, input.byteLength));
  if (String.fromCharCode(...head).slice(0, 3) !== 'GIF') throw new Error('This file is not a GIF.');
  const gif = parseGIF(input);
  const frames = gif.frames.filter((f): f is GifFrame => 'image' in f);
  const gw = gif.lsd.width;
  const gh = gif.lsd.height;
  if (!frames.length || !gw || !gh) throw new Error('This GIF has no frames.');
  const { colors, fuzz } = LEVELS[opts.level];
  const scale = Math.min(1, Math.max(0.05, opts.scale));
  const box = opts.box;
  const width = box ? box.width : Math.max(1, Math.round(gw * scale));
  const height = box ? box.height : Math.max(1, Math.round(gh * scale));
  // Source and destination rectangles for each frame: the whole GIF, unless it is fitted into or cropped to a box.
  let src = [0, 0, gw, gh];
  let dst = [0, 0, width, height];
  if (box?.fit === 'cover') {
    const k = Math.max(width / gw, height / gh);
    const sw = Math.min(gw, width / k);
    const sh = Math.min(gh, height / k);
    src = [(gw - sw) / 2, (gh - sh) / 2, sw, sh];
  } else if (box) {
    const k = Math.min(width / gw, height / gh);
    const dw = Math.max(1, Math.round(gw * k));
    const dh = Math.max(1, Math.round(gh * k));
    dst = [Math.floor((width - dw) / 2), Math.floor((height - dh) / 2), dw, dh];
  }
  const keepEvery = Math.max(1, Math.round(opts.keepEvery));

  // The GIF's own canvas, with each frame's patch composited in order.
  const comp = new OffscreenCanvas(gw, gh);
  const cctx = comp.getContext('2d', { willReadFrequently: true })!;
  const patch = new OffscreenCanvas(1, 1);
  const pctx = patch.getContext('2d')!;
  const out = new OffscreenCanvas(width, height);
  const octx = out.getContext('2d', { willReadFrequently: true })!;
  octx.imageSmoothingQuality = 'high';

  // Pass 1: every displayed frame as full RGBA at the output size, with its delay.
  const full: { rgba: Uint8ClampedArray; delay: number }[] = [];
  let transparent = false;
  for (const [i, frame] of frames.entries()) {
    const f = decompressFrame(frame, gif.gct, true);
    const { left, top, width: fw, height: fh } = f.dims;
    const restore = f.disposalType === 3 ? cctx.getImageData(0, 0, gw, gh) : undefined;
    if (fw > 0 && fh > 0) {
      if (patch.width !== fw || patch.height !== fh) {
        patch.width = fw;
        patch.height = fh;
      }
      pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), fw, fh), 0, 0);
      cctx.drawImage(patch, left, top);
    }
    const delay = frameDelay(f.delay || 0);
    if (i % keepEvery === 0 || !full.length) {
      octx.clearRect(0, 0, width, height);
      octx.drawImage(comp, src[0]!, src[1]!, src[2]!, src[3]!, dst[0]!, dst[1]!, dst[2]!, dst[3]!);
      const rgba = octx.getImageData(0, 0, width, height).data;
      for (let p = 3; p < rgba.length && !transparent; p += 4) if (rgba[p]! < 128) transparent = true;
      full.push({ rgba, delay });
    } else {
      full[full.length - 1]!.delay += delay;
    }
    if (f.disposalType === 2) cctx.clearRect(left, top, fw, fh);
    else if (restore) cctx.putImageData(restore, 0, 0);
    opts.onProgress?.((0.4 * (i + 1)) / frames.length);
    if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
  }

  // Pass 2: choose what each frame stores.
  const written: OutFrame[] = [];
  const shown = new Uint8ClampedArray(width * height * 4); // what a player shows after the last written frame
  let prevSource: Uint8ClampedArray | undefined;
  for (const [n, { rgba, delay }] of full.entries()) {
    if (transparent || !prevSource) {
      const palette = transparent ? quantize(rgba, colors, { format: 'rgba4444', oneBitAlpha: true }) : quantize(rgba, colors, { format: 'rgb565' });
      const index = applyPalette(rgba, palette, transparent ? 'rgba4444' : 'rgb565');
      const t = transparent ? palette.findIndex((c) => c[3] === 0) : -1;
      written.push({ left: 0, top: 0, width, height, palette, index, transparentIndex: t, dispose: transparent ? 2 : 1, delay });
      if (!transparent) paint(shown, index, palette, 0, 0, width, width, height);
    } else {
      // Pixels that are the same as in the source's previous frame, or close to what is on screen, stay as they are.
      const same = new Uint8Array(width * height);
      let x0 = width, y0 = height, x1 = -1, y1 = -1;
      for (let p = 0, q = 0; p < same.length; p++, q += 4) {
        const exact = rgba[q] === prevSource[q] && rgba[q + 1] === prevSource[q + 1] && rgba[q + 2] === prevSource[q + 2];
        const near = fuzz > 0 && Math.abs(rgba[q]! - shown[q]!) <= fuzz && Math.abs(rgba[q + 1]! - shown[q + 1]!) <= fuzz && Math.abs(rgba[q + 2]! - shown[q + 2]!) <= fuzz;
        if (exact || near) {
          same[p] = 1;
          continue;
        }
        const x = p % width;
        const y = (p - x) / width;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (x1 < 0) {
        // Nothing changed: show the previous frame for longer instead.
        written[written.length - 1]!.delay += delay;
      } else {
        const w = x1 - x0 + 1;
        const h = y1 - y0 + 1;
        const changed: number[] = [];
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const p = y * width + x;
            if (!same[p]) changed.push(rgba[p * 4]!, rgba[p * 4 + 1]!, rgba[p * 4 + 2]!, 255);
          }
        }
        const palette = quantize(new Uint8ClampedArray(changed), colors - 1, { format: 'rgb565' });
        const t = palette.length;
        palette.push([0, 0, 0]);
        const mapped = applyPalette(new Uint8ClampedArray(changed), palette.slice(0, t), 'rgb565');
        const index = new Uint8Array(w * h);
        let k = 0;
        for (let y = y0, i = 0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++, i++) index[i] = same[y * width + x] ? t : mapped[k++]!;
        }
        written.push({ left: x0, top: y0, width: w, height: h, palette, index, transparentIndex: t, dispose: 1, delay });
        paint(shown, index, palette, x0, y0, w, width, h, t);
      }
    }
    prevSource = rgba;
    opts.onProgress?.(0.4 + (0.6 * (n + 1)) / full.length);
    if (n % 10 === 9) await new Promise((r) => setTimeout(r, 0));
  }

  const bytes = writeGif(width, height, written, loopCount(gif));
  const unchanged = !opts.force && bytes.length >= input.byteLength;
  return {
    bytes: unchanged ? new Uint8Array(input) : bytes,
    width: unchanged ? gw : width,
    height: unchanged ? gh : height,
    framesIn: frames.length,
    framesOut: unchanged ? frames.length : written.length,
    unchanged,
  };
}

/** Draw indexed pixels onto the RGBA "what is on screen" buffer. */
function paint(shown: Uint8ClampedArray, index: Uint8Array, palette: Palette, left: number, top: number, w: number, stride: number, h: number, skip = -1) {
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const c = index[i]!;
      if (c === skip) continue;
      const q = ((top + y) * stride + left + x) * 4;
      const rgb = palette[c]!;
      shown[q] = rgb[0]!;
      shown[q + 1] = rgb[1]!;
      shown[q + 2] = rgb[2]!;
      shown[q + 3] = 255;
    }
  }
}

/** A GIF89a file, byte by byte: no global palette, one local palette per frame. */
function writeGif(width: number, height: number, frames: OutFrame[], loops: number | undefined): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const bytes = (...b: number[]) => parts.push(Uint8Array.from(b));
  const u16 = (n: number) => [n & 255, (n >> 8) & 255];
  bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...u16(width), ...u16(height), 0x70, 0, 0);
  if (loops !== undefined) bytes(0x21, 0xff, 0x0b, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 0x03, 0x01, ...u16(loops), 0);
  for (const f of frames) {
    const depth = Math.max(1, Math.ceil(Math.log2(Math.max(2, f.palette.length))));
    const t = f.transparentIndex >= 0;
    bytes(0x21, 0xf9, 0x04, (f.dispose << 2) | (t ? 1 : 0), ...u16(Math.round(f.delay / 10)), t ? f.transparentIndex : 0, 0);
    bytes(0x2c, ...u16(f.left), ...u16(f.top), ...u16(f.width), ...u16(f.height), 0x80 | (depth - 1));
    const table = new Uint8Array(3 << depth);
    f.palette.forEach((c, i) => table.set([c[0]!, c[1]!, c[2]!], i * 3));
    parts.push(table);
    const stream = lzwStream();
    lzwEncode(f.width, f.height, f.index, depth, stream);
    parts.push(stream.bytes());
  }
  bytes(0x3b);
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** The small byte sink gifenc's LZW coder writes into. */
function lzwStream() {
  let buf = new Uint8Array(4096);
  let n = 0;
  const grow = (need: number) => {
    if (n + need <= buf.length) return;
    const next = new Uint8Array(Math.max(buf.length * 2, n + need));
    next.set(buf.subarray(0, n));
    buf = next;
  };
  return {
    writeByte(b: number) {
      grow(1);
      buf[n++] = b;
    },
    writeBytesView(data: Uint8Array, offset = 0, length = data.byteLength) {
      grow(length);
      buf.set(data.subarray(offset, offset + length), n);
      n += length;
    },
    bytesView: () => buf.subarray(0, n),
    bytes: () => buf.slice(0, n),
  };
}

/** How many image frames a GIF holds (1 for a still GIF). */
export function gifFrameCount(input: ArrayBuffer): number {
  return parseGIF(input).frames.filter((f) => 'image' in f).length;
}
