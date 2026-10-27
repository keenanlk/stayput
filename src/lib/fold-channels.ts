/** Kept free of browser and codec imports so a spec can drive it directly. */

/**
 * Surround channels folded to stereo by the usual rules, so the centre channel (film dialogue) is kept. Layouts are
 * SMPTE order: 3 = L R C; 4 = L R Ls Rs; 5 = L R C Ls Rs; 6 = L R C LFE Ls Rs; 8 = L R C LFE Ls Rs Lb Rb. Mono and stereo pass through.
 */
export function foldToStereo(chans: Float32Array[]): Float32Array[] {
  const n = chans.length;
  if (n <= 2) return chans;
  const len = chans[0]!.length;
  const k = Math.SQRT1_2;
  const centre = n === 4 ? -1 : 2;
  const side = n === 4 ? [2, 3] : n === 5 ? [3, 4] : n >= 6 ? [4, 5] : [];
  const back = n >= 8 ? [6, 7] : [];
  const scale = 1 / (1 + k * ((centre >= 0 ? 1 : 0) + (side.length ? 1 : 0) + (back.length ? 1 : 0)));
  const out = [new Float32Array(len), new Float32Array(len)];
  for (let s = 0; s < 2; s++) {
    const o = out[s]!;
    const add = (c: number, g: number) => {
      if (c < 0 || !chans[c]) return;
      const src = chans[c]!;
      for (let i = 0; i < len; i++) o[i]! += src[i]! * g;
    };
    add(s, 1);
    add(centre, k);
    if (side.length) add(side[s]!, k);
    if (back.length) add(back[s]!, k);
    for (let i = 0; i < len; i++) o[i] = o[i]! * scale;
  }
  return out;
}
