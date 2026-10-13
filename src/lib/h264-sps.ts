/**
 * Picture size and codec string of an H.264 stream, read from its AVCDecoderConfigurationRecord (the "avcC"
 * bytes an FLV or MP4 carries). Needed because the FLV reader build has no H.264 decoder to ask.
 */

class Bits {
  private pos = 0;
  constructor(private readonly b: Uint8Array) {}
  u(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.pos >> 3];
      if (byte === undefined) throw new RangeError('SPS ended early');
      v = v * 2 + ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
  ue(): number {
    let zeros = 0;
    while (this.u(1) === 0) if (++zeros > 31) throw new RangeError('bad exp-golomb');
    return zeros === 0 ? 0 : 2 ** zeros - 1 + this.u(zeros);
  }
  se(): number {
    const k = this.ue();
    return k & 1 ? (k + 1) / 2 : -k / 2;
  }
}

export interface AvcInfo {
  width: number;
  height: number;
  /** WebCodecs codec string, for example avc1.64001f. */
  codec: string;
}

/** Null when the record is not an avcC or its SPS cannot be read. */
export function readAvcConfig(avcC: Uint8Array): AvcInfo | null {
  try {
    if (avcC.length < 8 || avcC[0] !== 1 || (avcC[5]! & 31) < 1) return null;
    const len = (avcC[6]! << 8) | avcC[7]!;
    const nal = avcC.subarray(8, 8 + len);
    if (nal.length < 4 || (nal[0]! & 31) !== 7) return null;
    // Remove emulation prevention bytes (00 00 03 -> 00 00).
    const rbsp: number[] = [];
    for (let i = 1; i < nal.length; i++) {
      if (i >= 3 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue;
      rbsp.push(nal[i]!);
    }
    const r = new Bits(Uint8Array.from(rbsp));
    const profile = r.u(8);
    r.u(8);
    r.u(8);
    r.ue();
    let chroma = 1;
    if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
      chroma = r.ue();
      if (chroma === 3) r.u(1);
      r.ue();
      r.ue();
      r.u(1);
      if (r.u(1)) {
        for (let i = 0; i < (chroma === 3 ? 12 : 8); i++) {
          if (!r.u(1)) continue;
          let last = 8;
          let next = 8;
          for (let j = 0; j < (i < 6 ? 16 : 64); j++) {
            if (next !== 0) next = (last + r.se() + 256) % 256;
            last = next === 0 ? last : next;
          }
        }
      }
    }
    r.ue();
    const pocType = r.ue();
    if (pocType === 0) r.ue();
    else if (pocType === 1) {
      r.u(1);
      r.se();
      r.se();
      const n = r.ue();
      for (let i = 0; i < n; i++) r.se();
    }
    r.ue();
    r.u(1);
    const mbW = r.ue() + 1;
    const mbH = r.ue() + 1;
    const frameOnly = r.u(1);
    if (!frameOnly) r.u(1);
    r.u(1);
    let [cl, cr, ct, cb] = [0, 0, 0, 0];
    if (r.u(1)) [cl, cr, ct, cb] = [r.ue(), r.ue(), r.ue(), r.ue()];
    const unitX = chroma === 0 || chroma === 3 ? 1 : 2;
    const unitY = (chroma === 1 ? 2 : 1) * (frameOnly ? 1 : 2);
    const width = mbW * 16 - unitX * (cl + cr);
    const height = (frameOnly ? 1 : 2) * mbH * 16 - unitY * (ct + cb);
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return width > 0 && height > 0 ? { width, height, codec: `avc1.${hex(avcC[1]!)}${hex(avcC[2]!)}${hex(avcC[3]!)}` } : null;
  } catch {
    return null;
  }
}
