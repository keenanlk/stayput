/**
 * The frames of an AMR file, cut by hand. A bare .amr file ("#!AMR\n" or "#!AMR-WB\n", then frames) has no container, and the libav
 * build the page ships has no AMR file reader (only the MP4 family one), so the frames are found here and handed to its decoder one
 * by one. Each frame starts with a header byte whose bits 3 to 6 are the mode, and the mode fixes the frame's length. Kept free of
 * browser imports so a spec can drive it directly.
 */

/** Frame length in bytes, header byte included, by mode (the table FFmpeg's AMR reader uses). */
const NARROW = [13, 14, 16, 18, 20, 21, 27, 32, 6, 1, 1, 1, 1, 1, 1, 1];
const WIDE = [18, 24, 33, 37, 41, 47, 51, 59, 61, 6, 6, 1, 1, 1, 1, 1];

const MAGIC_NARROW = '#!AMR\n';
const MAGIC_WIDE = '#!AMR-WB\n';

export interface AmrFrames {
  wide: boolean;
  frames: Uint8Array[];
}

/** The frames of a bare AMR file, or null when the bytes do not start with an AMR header. A frame cut short at the end is dropped. */
export function splitAmr(bytes: Uint8Array): AmrFrames | null {
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, MAGIC_WIDE.length));
  const wide = text.startsWith(MAGIC_WIDE);
  if (!wide && !text.startsWith(MAGIC_NARROW)) return null;
  const sizes = wide ? WIDE : NARROW;
  const frames: Uint8Array[] = [];
  for (let at = wide ? MAGIC_WIDE.length : MAGIC_NARROW.length; at < bytes.length; ) {
    const size = sizes[(bytes[at]! >> 3) & 0x0f]!;
    if (at + size > bytes.length) break;
    frames.push(bytes.subarray(at, at + size));
    at += size;
  }
  return { wide, frames };
}
