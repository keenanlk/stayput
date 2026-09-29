/**
 * Animated WebP, read frame by frame. Browsers only hand a page the first
 * frame of an animated WebP, so this parses the RIFF container itself, wraps
 * each frame's bitstream as a standalone still WebP for the browser's own
 * decoder, and composites the frames onto a canvas following the file's blend
 * and dispose rules. Works wherever the browser can decode a still WebP.
 */

export interface WebpFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Milliseconds this frame stays on screen. */
  duration: number;
  /** Alpha-blend onto the canvas (true) or overwrite the frame rectangle (false). */
  blend: boolean;
  /** Clear the frame rectangle to transparent before the next frame. */
  dispose: boolean;
  /** The frame's ALPH, VP8 or VP8L chunks, exactly as stored. */
  chunks: { fourcc: string; data: Uint8Array }[];
}

export interface WebpAnimation {
  width: number;
  height: number;
  /** 0 = loop forever. */
  loops: number;
  frames: WebpFrame[];
}

const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
const u24 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);

function* chunksOf(b: Uint8Array, start: number, end: number): Generator<{ fourcc: string; data: Uint8Array }> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = start;
  while (o + 8 <= end) {
    const id = fourcc(b, o);
    const size = v.getUint32(o + 4, true);
    const dataEnd = o + 8 + size;
    if (dataEnd > end) throw new Error('This WebP file is cut short.');
    yield { fourcc: id, data: b.subarray(o + 8, dataEnd) };
    o = dataEnd + (size & 1);
  }
}

/** Parse an animated WebP, or return undefined for a still one (or anything else). */
export function parseAnimatedWebp(bytes: Uint8Array): WebpAnimation | undefined {
  if (bytes.length < 30 || fourcc(bytes, 0) !== 'RIFF' || fourcc(bytes, 8) !== 'WEBP' || fourcc(bytes, 12) !== 'VP8X') return undefined;
  const flags = bytes[20]!;
  if (!(flags & 0x02)) return undefined;
  const riffEnd = Math.min(bytes.length, 8 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true));
  const anim: WebpAnimation = { width: u24(bytes, 24) + 1, height: u24(bytes, 27) + 1, loops: 0, frames: [] };
  for (const c of chunksOf(bytes, 12, riffEnd)) {
    if (c.fourcc === 'ANIM' && c.data.length >= 6) anim.loops = c.data[4]! | (c.data[5]! << 8);
    if (c.fourcc !== 'ANMF' || c.data.length < 16) continue;
    const d = c.data;
    anim.frames.push({
      x: u24(d, 0) * 2,
      y: u24(d, 3) * 2,
      width: u24(d, 6) + 1,
      height: u24(d, 9) + 1,
      duration: u24(d, 12),
      blend: !(d[15]! & 0x02),
      dispose: !!(d[15]! & 0x01),
      chunks: [...chunksOf(d, 16, d.length)].filter((f) => f.fourcc === 'ALPH' || f.fourcc === 'VP8 ' || f.fourcc === 'VP8L'),
    });
  }
  return anim.frames.length ? anim : undefined;
}

/** Wrap one frame's chunks as a standalone still WebP file. */
export function frameAsWebp(frame: WebpFrame): Blob {
  const parts: Uint8Array[] = [];
  const chunk = (id: string, data: Uint8Array) => {
    const head = new Uint8Array(8);
    for (let i = 0; i < 4; i++) head[i] = id.charCodeAt(i);
    new DataView(head.buffer).setUint32(4, data.length, true);
    parts.push(head, data);
    if (data.length & 1) parts.push(new Uint8Array(1));
  };
  if (frame.chunks.some((c) => c.fourcc === 'ALPH')) {
    // Lossy with a separate alpha chunk needs the extended header to be valid.
    const x = new Uint8Array(10);
    x[0] = 0x10;
    const w = frame.width - 1;
    const h = frame.height - 1;
    x.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 4);
    chunk('VP8X', x);
  }
  for (const c of frame.chunks) chunk(c.fourcc, c.data);
  const body = parts.reduce((n, p) => n + p.length, 0);
  const riff = new Uint8Array(12);
  riff.set([0x52, 0x49, 0x46, 0x46]);
  new DataView(riff.buffer).setUint32(4, body + 4, true);
  riff.set([0x57, 0x45, 0x42, 0x50], 8);
  return new Blob([riff, ...parts] as BlobPart[], { type: 'image/webp' });
}

/**
 * Composite the animation, calling `onFrame` with the full canvas after each
 * frame is drawn. Frames are produced one at a time so a long animation never
 * has to sit in memory all at once.
 */
export async function renderWebpFrames(anim: WebpAnimation, onFrame: (rgba: ImageData, duration: number, index: number) => void | Promise<void>): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = anim.width;
  canvas.height = anim.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  for (const [i, f] of anim.frames.entries()) {
    const bitmap = await createImageBitmap(frameAsWebp(f));
    if (!f.blend) ctx.clearRect(f.x, f.y, f.width, f.height);
    ctx.drawImage(bitmap, f.x, f.y);
    bitmap.close();
    await onFrame(ctx.getImageData(0, 0, anim.width, anim.height), f.duration, i);
    if (f.dispose) ctx.clearRect(f.x, f.y, f.width, f.height);
  }
}
