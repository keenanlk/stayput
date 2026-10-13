/**
 * Sound frames from the libav.js decoders as plain float channels, mixed down to at most two.
 * Shared by the decoder workers that read old formats browsers cannot open.
 */

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

export interface LibavSoundFrame {
  data: ArrayLike<number> | ArrayLike<number>[];
  format: number;
  sample_rate?: number;
  channels?: number;
  nb_samples?: number;
}

/** Planar float32 channels from a decoded audio frame, mixed down to at most two. */
export function toFloatPlanes(f: LibavSoundFrame): Float32Array[] {
  const planar = Array.isArray(f.data);
  const channels = f.channels ?? (planar ? (f.data as unknown[]).length : 1);
  const n = f.nb_samples ?? (planar ? (f.data as ArrayLike<number>[])[0]!.length : (f.data as ArrayLike<number>).length / channels);
  const k = f.format === Sample.S16 || f.format === Sample.S16P ? 1 / 32768 : f.format === Sample.S32 || f.format === Sample.S32P ? 1 / 2147483648 : 1;
  const unsigned8 = f.format === Sample.U8 || f.format === Sample.U8P;
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
export function mixToStereo(planes: Float32Array[]): Float32Array[] {
  if (planes.length <= 2) return planes;
  const n = planes[0]!.length;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  // FFmpeg's order for 5.1: front left, front right, centre, LFE, back left, back right.
  const six = planes.length >= 6;
  const w = six ? [1, 0, 0.707, 0, 0.707, 0] : [1, 0, 0, 0, 0, 0];
  const wr = six ? [0, 1, 0.707, 0, 0, 0.707] : [0, 1, 0, 0, 0, 0];
  const norm = six ? 1 / 2.414 : 1;
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
