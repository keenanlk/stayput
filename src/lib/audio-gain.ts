/**
 * Make sound louder or quieter without clipping. A gain is applied to every
 * sample, then a look-ahead peak limiter turns down only the moments that
 * would go past the ceiling, easing in over 5 ms before the peak and back out
 * over 150 ms after it, so boosted speech and music stay clean.
 */

/** -1 dBFS: leaves room for MP3 and AAC encoders, which overshoot slightly. */
export const CEILING = 10 ** (-1 / 20);

export const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(g);

export function peakOf(chans: Float32Array[]): number {
  let peak = 0;
  for (const ch of chans) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]!));
  return peak;
}

/**
 * Loudness in dB of the loud parts: the RMS of 400 ms blocks, ignoring blocks
 * more than 20 dB below the loudest, a rough stand-in for LUFS gating that
 * keeps pauses from dragging the figure down.
 */
export function loudnessOf(chans: Float32Array[], rate: number): number {
  const n = chans[0]!.length;
  const block = Math.max(1, Math.round(rate * 0.4));
  const levels: number[] = [];
  for (let s = 0; s < n; s += block) {
    let sum = 0;
    let count = 0;
    for (const ch of chans) {
      for (let i = s; i < Math.min(n, s + block); i++) sum += ch[i]! * ch[i]!;
      count += Math.min(n, s + block) - s;
    }
    levels.push(sum / Math.max(1, count));
  }
  const loudest = Math.max(...levels, 1e-12);
  const kept = levels.filter((l) => l >= loudest / 100);
  const mean = kept.reduce((a, b) => a + b, 0) / Math.max(1, kept.length);
  return 10 * Math.log10(Math.max(mean, 1e-12));
}

export interface GainResult {
  chans: Float32Array[];
  /** Share of samples the limiter turned down, 0 to 1. */
  limited: number;
}

/** Multiply by `gain`, then limit peaks to CEILING. Returns new arrays. */
export function applyGain(chans: Float32Array[], gain: number, rate: number): GainResult {
  const n = chans[0]!.length;
  const out = chans.map((ch) => {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = ch[i]! * gain;
    return o;
  });
  // The gain each sample needs to stay under the ceiling, linked across channels.
  const env = new Float32Array(n);
  let over = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const o of out) m = Math.max(m, Math.abs(o[i]!));
    env[i] = m > CEILING ? CEILING / m : 1;
    if (m > CEILING) over++;
  }
  if (!over) return { chans: out, limited: 0 };
  // Ease in before each peak (look-ahead), then release slowly after it.
  const attack = 1 / Math.max(1, Math.round(rate * 0.005));
  const release = 1 / Math.max(1, Math.round(rate * 0.15));
  for (let i = n - 2; i >= 0; i--) env[i] = Math.min(env[i]!, env[i + 1]! + attack);
  for (let i = 1; i < n; i++) env[i] = Math.min(env[i]!, env[i - 1]! + release);
  let limited = 0;
  for (let i = 0; i < n; i++) {
    const g = env[i]!;
    if (g < 0.999) limited++;
    for (const o of out) o[i] = o[i]! * g;
  }
  return { chans: out, limited: limited / n };
}

export type VolumeMode = { kind: 'boost'; db: number } | { kind: 'normalize'; target: number } | { kind: 'peak' };

/** The gain in dB the mode asks for on this sound. */
export function gainFor(mode: VolumeMode, chans: Float32Array[], rate: number): number {
  if (mode.kind === 'boost') return mode.db;
  if (mode.kind === 'peak') {
    const peak = peakOf(chans);
    return peak > 0 ? gainToDb(CEILING / peak) : 0;
  }
  // Loudness target, but never more than +30 dB (so near silence is not turned into hiss).
  return Math.min(30, mode.target - loudnessOf(chans, rate));
}
