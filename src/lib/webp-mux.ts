import { NamedError } from './input-error';

/**
 * Animated WebP writer. Takes still WebP files (one per frame, as any WebP encoder produces them)
 * and wraps their bitstreams in a RIFF/VP8X container with an ANIM chunk and one ANMF chunk per
 * frame. Frames are whole pictures at the canvas size, drawn over the canvas without blending, so
 * each one replaces the last. No dependencies; used with the jSquash encoder in gif-webp.ts.
 */

export interface MuxFrame {
  /** A complete still WebP file: simple lossy, simple lossless, or extended with an ALPH chunk. */
  webp: Uint8Array;
  /** Milliseconds on screen; WebP stores up to 16 777 215. */
  delayMs: number;
}

const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

/** The bitstream chunks of a still WebP (ALPH, VP8, VP8L) and whether any of them carries alpha. */
function imageChunks(webp: Uint8Array): { chunks: Uint8Array[]; alpha: boolean } {
  if (webp.length < 20 || tag(webp, 0) !== 'RIFF' || tag(webp, 8) !== 'WEBP') throw new NamedError('WebpMuxInvalidFrame', 'The encoder did not return a WebP image.');
  const v = new DataView(webp.buffer, webp.byteOffset, webp.byteLength);
  const chunks: Uint8Array[] = [];
  let alpha = false;
  for (let o = 12; o + 8 <= webp.length; ) {
    const id = tag(webp, o);
    const size = v.getUint32(o + 4, true);
    const end = o + 8 + size;
    if (end > webp.length) throw new NamedError('WebpMuxCutShort', 'The encoder returned a cut-short WebP image.');
    if (id === 'ALPH') alpha = true;
    if (id === 'VP8L') alpha = alpha || (webp[o + 8 + 4]! & 0x10) !== 0;
    if (id === 'ALPH' || id === 'VP8 ' || id === 'VP8L') chunks.push(webp.subarray(o, end));
    o = end + (size & 1);
  }
  if (!chunks.length) throw new NamedError('WebpMuxInvalidFrame', 'The encoder did not return a WebP image.');
  return { chunks, alpha };
}

const padded = (n: number) => n + (n & 1);

/** `loops` is the number of plays, 0 for forever (the WebP ANIM loop count). */
export function muxAnimatedWebp(o: { width: number; height: number; frames: MuxFrame[]; loops: number }): Uint8Array<ArrayBuffer> {
  const { width, height, frames } = o;
  if (!frames.length) throw new NamedError('WebpMuxNoFrames', 'There are no frames to write.');
  if (width < 1 || height < 1 || width > 16384 || height > 16384) throw new NamedError('WebpTooLarge', 'This size cannot be stored in a WebP file (the limit is 16383 pixels a side).');
  const parsed = frames.map((f) => ({ ...imageChunks(f.webp), delayMs: Math.min(0xffffff, Math.max(0, Math.round(f.delayMs))) }));
  const hasAlpha = parsed.some((p) => p.alpha);
  // Each ANMF payload: 16 bytes of frame header, then the frame's own chunks (already padded in place).
  const anmfSizes = parsed.map((p) => 16 + p.chunks.reduce((n, c) => n + padded(c.length), 0));
  const total = 4 + (8 + 10) + (8 + 6) + anmfSizes.reduce((n, s) => n + 8 + s, 0);
  const out = new Uint8Array(8 + total);
  const v = new DataView(out.buffer);
  let p = 0;
  const put = (s: string) => {
    for (let i = 0; i < 4; i++) out[p++] = s.charCodeAt(i);
  };
  const u24 = (n: number) => {
    out[p++] = n & 255;
    out[p++] = (n >> 8) & 255;
    out[p++] = (n >> 16) & 255;
  };
  put('RIFF');
  v.setUint32(p, total, true);
  p += 4;
  put('WEBP');
  put('VP8X');
  v.setUint32(p, 10, true);
  p += 4;
  out[p++] = 0x02 | (hasAlpha ? 0x10 : 0); // animation, alpha
  p += 3;
  u24(width - 1);
  u24(height - 1);
  put('ANIM');
  v.setUint32(p, 6, true);
  p += 4;
  // Background colour: transparent black, so a player that ignores it still shows the frames.
  p += 4;
  v.setUint16(p, Math.min(65535, Math.max(0, o.loops)), true);
  p += 2;
  for (const [i, f] of parsed.entries()) {
    put('ANMF');
    v.setUint32(p, anmfSizes[i]!, true);
    p += 4;
    u24(0);
    u24(0);
    u24(width - 1);
    u24(height - 1);
    u24(f.delayMs);
    out[p++] = 0x02; // do not blend with the previous canvas, do not dispose
    for (const c of f.chunks) {
      out.set(c, p);
      p += padded(c.length);
    }
  }
  return out;
}
