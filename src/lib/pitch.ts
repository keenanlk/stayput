/**
 * Change the speed and the pitch of a sound independently. The sound is first
 * time-stretched (WSOLA, pitch kept) and then resampled, which moves the pitch
 * and the length together; the two steps are sized so that the result has the
 * chosen speed and the chosen pitch.
 */
import { timeStretch } from './stretch';

/** Pitch ratio for a shift in semitones (12 = one octave up). */
export const semitoneRatio = (semitones: number) => 2 ** (semitones / 12);

const TAPS = 16; // sinc taps each side

/**
 * Play the sound `ratio` times faster by resampling: shorter and higher by that
 * ratio. A windowed-sinc filter with its cutoff lowered when raising the pitch
 * keeps high notes from folding back as noise.
 */
export function resample(chans: Float32Array[], ratio: number): Float32Array[] {
  if (Math.abs(ratio - 1) < 1e-6) return chans.map((c) => c.slice());
  const len = chans[0]?.length ?? 0;
  const outLen = Math.max(1, Math.floor(len / ratio));
  const cutoff = Math.min(1, 1 / ratio);
  return chans.map((c) => {
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const x = i * ratio;
      const x0 = Math.floor(x);
      let sum = 0;
      let wsum = 0;
      for (let k = x0 - TAPS + 1; k <= x0 + TAPS; k++) {
        if (k < 0 || k >= len) continue;
        const t = x - k;
        const a = Math.PI * t * cutoff;
        const sinc = t === 0 ? 1 : Math.sin(a) / a;
        const w = 0.5 + 0.5 * Math.cos((Math.PI * t) / (TAPS + 1)); // Hann window
        const coef = sinc * w;
        sum += c[k]! * coef;
        wsum += coef;
      }
      out[i] = wsum ? sum / wsum : 0;
    }
    return out;
  });
}

/**
 * Change speed (2 = twice as fast, half as long) and pitch (a ratio, 2 = an
 * octave up) independently.
 */
export function speedAndPitch(chans: Float32Array[], speed: number, pitch: number): Float32Array[] {
  if (Math.abs(speed - 1) < 1e-6 && Math.abs(pitch - 1) < 1e-6) return chans.map((c) => c.slice());
  // Stretch to len * pitch / speed with the pitch kept, then resample by `pitch`:
  // the length ends at len / speed and every frequency is multiplied by `pitch`.
  const stretched = Math.abs(speed / pitch - 1) < 1e-6 ? chans : timeStretch(chans, speed / pitch);
  return resample(stretched, pitch);
}
