/**
 * Decoded-sound helpers shared by the libav.js workers (AVI and FLV): a libav audio frame in any of its
 * sample layouts becomes planar float32, mixed down to at most two channels.
 */

export interface LibavAudioFrame {
  data: Uint8Array | Int16Array | Int32Array | Float32Array | Float64Array | (Int16Array | Int32Array | Float32Array | Float64Array | Uint8Array)[];
  format: number;
  channels?: number;
  nb_samples?: number;
}

/** libav's sample format numbers. */
const enum Sample {
  U8 = 0,
  S16 = 1,
  S32 = 2,
  FLT = 3,
  DBL = 4,
  U8P = 5,
  S16P = 6,
  S32P = 7,
  FLTP = 8,
  DBLP = 9,
}

/** Planar float32 channels from a decoded audio frame, mixed down to at most two. */
export function toFloatPlanes(f: LibavAudioFrame): Float32Array[] {
  const planar = Array.isArray(f.data);
  const channels = f.channels ?? (planar ? (f.data as unknown[]).length : 1);
  const n = f.nb_samples ?? (planar ? (f.data as ArrayLike<number>[])[0]!.length : (f.data as ArrayLike<number>).length / channels);
  const scale = (fmt: number) => (fmt === Sample.S16 || fmt === Sample.S16P ? 1 / 32768 : fmt === Sample.S32 || fmt === Sample.S32P ? 1 / 2147483648 : 1);
  const unsigned8 = f.format === Sample.U8 || f.format === Sample.U8P;
  const k = scale(f.format);
  const read = (src: ArrayLike<number>, at: number) => (unsigned8 ? (src[at]! - 128) / 128 : src[at]! * k);
  const planes: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const out = new Float32Array(n);
    if (planar) {
      const src = (f.data as ArrayLike<number>[])[c]!;
      for (let i = 0; i < n; i++) out[i] = read(src, i);
    } else {
      const src = f.data as ArrayLike<number>;
      for (let i = 0; i < n; i++) out[i] = read(src, i * channels + c);
    }
    planes.push(out);
  }
  return mixToStereo(planes);
}

/** One or two channels pass through; surround is folded down with the usual -3 dB centre and surround weights. */
function mixToStereo(planes: Float32Array[]): Float32Array[] {
  if (planes.length <= 2) return planes;
  const n = planes[0]!.length;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  // FFmpeg's order for 5.1: front left, front right, centre, LFE, back left, back right.
  const w = planes.length >= 6 ? [1, 0, 0.707, 0, 0.707, 0] : [1, 0, 0, 0, 0, 0];
  const wr = planes.length >= 6 ? [0, 1, 0.707, 0, 0, 0.707] : [0, 1, 0, 0, 0, 0];
  const norm = planes.length >= 6 ? 1 / 2.414 : 1;
  for (let i = 0; i < n; i++) {
    let l = 0;
    let r = 0;
    for (let c = 0; c < Math.min(6, planes.length); c++) {
      l += planes[c]![i]! * w[c]!;
      r += planes[c]![i]! * wr[c]!;
    }
    left[i] = l * norm;
    right[i] = r * norm;
  }
  return [left, right];
}
