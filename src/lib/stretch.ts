/**
 * Change the speed of sound without changing its pitch, with WSOLA (waveform
 * similarity overlap-add): the audio is cut into overlapping 43 ms windows
 * taken further apart (faster) or closer together (slower) than they are laid
 * back down, and each window is nudged to where it lines up best with the one
 * before, so the result has no clicks or echoes. Voices stay the same pitch.
 */

const N = 2048; // window length, in samples
const HS = N / 2; // step between windows in the output
const SEARCH = 384; // how far a window may move to line up, in samples
const COARSE = 4; // test every 4th offset and compare every 4th sample; plenty for speech and music

/** Stretch each channel by 1 / speed (speed 2 halves the length). All channels move together. */
export function timeStretch(channels: Float32Array[], speed: number): Float32Array[] {
  if (Math.abs(speed - 1) < 1e-6 || !channels.length) return channels.map((c) => c.slice());
  const len = channels[0]!.length;
  // A mono mix decides where windows go, so stereo stays in step.
  const mono = new Float32Array(len);
  for (const c of channels) for (let i = 0; i < len; i++) mono[i]! += c[i]! / channels.length;
  const ha = HS * speed;
  const outLen = Math.max(1, Math.round(len / speed));
  const out = channels.map(() => new Float32Array(outLen + N));
  const norm = new Float32Array(outLen + N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  let prev = 0; // where the last window was taken from
  for (let k = 0, at = 0; at < outLen; k++, at += HS) {
    let pos = Math.round(k * ha);
    if (k > 0) {
      // Find the offset whose start looks most like what naturally followed the last window.
      const natural = prev + HS;
      let best = 0;
      let bestScore = -Infinity;
      for (let d = -SEARCH; d <= SEARCH; d += COARSE) {
        const p = pos + d;
        if (p < 0 || p + N > len) continue;
        let score = 0;
        for (let i = 0; i < N / 2; i += COARSE) score += mono[p + i]! * (mono[natural + i] ?? 0);
        if (score > bestScore) {
          bestScore = score;
          best = d;
        }
      }
      pos += best;
    }
    pos = Math.max(0, Math.min(pos, Math.max(0, len - N)));
    for (const [c, ch] of channels.entries()) {
      const o = out[c]!;
      for (let i = 0; i < N && pos + i < len; i++) o[at + i]! += ch[pos + i]! * win[i]!;
    }
    for (let i = 0; i < N; i++) norm[at + i]! += win[i]!;
    prev = pos;
  }
  return out.map((o) => {
    const r = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) r[i] = norm[i]! > 1e-3 ? o[i]! / norm[i]! : o[i]!;
    return r;
  });
}
