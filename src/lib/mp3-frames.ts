/** Reading MP3 frame boundaries out of an encoder's output. */

/** Frame length in bytes of the MPEG-1 Layer III frame that starts at `at`, or 0 when no valid header is there. */
export function mp3FrameLength(bytes: Uint8Array, at: number): number {
  if (at + 4 > bytes.length) return 0;
  const b1 = bytes[at + 1]!;
  const b2 = bytes[at + 2]!;
  if (bytes[at] !== 0xff || (b1 & 0xfe) !== 0xfa) return 0; // sync, MPEG-1, Layer III
  const kbps = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0][b2 >> 4]!;
  const rate = [44100, 48000, 32000, 0][(b2 >> 2) & 3]!;
  if (!kbps || !rate) return 0;
  return Math.floor((144 * kbps * 1000) / rate) + ((b2 >> 1) & 1);
}

/** Split encoder output into whole frames; whatever is left over (a frame still being written) comes back as `rest`. */
export function splitMp3Frames(bytes: Uint8Array): { frames: Uint8Array[]; rest: Uint8Array<ArrayBuffer> } {
  const frames: Uint8Array[] = [];
  let at = 0;
  while (at < bytes.length) {
    const len = mp3FrameLength(bytes, at);
    if (!len) {
      if (at + 4 > bytes.length) break;
      at++; // not a frame start: skip a byte (the encoder writes none, but a tag would be skipped here)
      continue;
    }
    if (at + len > bytes.length) break;
    frames.push(bytes.slice(at, at + len));
    at += len;
  }
  return { frames, rest: bytes.slice(at) };
}
