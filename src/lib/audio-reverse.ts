/** Play PCM backwards: each channel's samples in the opposite order, so the channels stay in step. */
export function reverseChannels(chans: Float32Array[]): Float32Array[] {
  return chans.map((c) => {
    const out = new Float32Array(c.length);
    for (let i = 0, j = c.length - 1; j >= 0; i++, j--) out[i] = c[j]!;
    return out;
  });
}
