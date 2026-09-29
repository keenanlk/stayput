/**
 * Shorten the pauses in a recording. The level is measured in 10 ms windows
 * (the loudest channel counts); a quiet stretch longer than `minSilence` is
 * cut down to a pause of `keep` seconds, half left on each side, and quiet
 * at the very start and end is trimmed away. Each join gets a short crossfade
 * so it does not click.
 */

export interface SilenceOptions {
  /** Level, in dBFS, below which a window counts as silent. */
  thresholdDb?: number;
  /** Only pauses longer than this (seconds) are shortened. */
  minSilence?: number;
  /** Length of pause (seconds) left where a long one was. */
  keep?: number;
}

export interface SilenceResult {
  chans: Float32Array[];
  /** Seconds taken out. */
  removed: number;
  /** Pauses that were shortened, including trimmed ends. */
  cuts: number;
}

const WINDOW = 0.01;
const FADE = 0.005;

/** Silent stretches as [start, end) sample ranges. */
export function findSilences(chans: Float32Array[], rate: number, thresholdDb: number, minSilence: number): [number, number][] {
  const len = chans[0]?.length ?? 0;
  const win = Math.max(1, Math.round(rate * WINDOW));
  const limit = 10 ** (thresholdDb / 20);
  const runs: [number, number][] = [];
  let start = -1;
  for (let w = 0; w * win < len; w++) {
    const a = w * win;
    const b = Math.min(len, a + win);
    let loud = 0;
    for (const c of chans) {
      let sum = 0;
      for (let i = a; i < b; i++) sum += c[i]! * c[i]!;
      loud = Math.max(loud, Math.sqrt(sum / (b - a)));
    }
    if (loud < limit) {
      if (start < 0) start = a;
    } else if (start >= 0) {
      runs.push([start, a]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, len]);
  const min = minSilence * rate;
  // A quiet start or end is trimmed whatever its length.
  return runs.filter(([s, e]) => e - s >= min || s === 0 || e === len);
}

export function removeSilence(chans: Float32Array[], rate: number, opts: SilenceOptions = {}): SilenceResult {
  const { thresholdDb = -40, minSilence = 0.5, keep = 0.25 } = opts;
  const len = chans[0]?.length ?? 0;
  const half = Math.round((keep * rate) / 2);
  // Parts of the sound to keep, as [start, end) ranges.
  const parts: [number, number][] = [];
  let pos = 0;
  let cuts = 0;
  for (const [s, e] of findSilences(chans, rate, thresholdDb, minSilence)) {
    // Quiet at the very start or end goes entirely; a pause inside keeps `keep` seconds.
    const edge = s === 0 || e === len;
    const cutFrom = edge ? s : Math.min(e, s + half);
    const cutTo = edge ? e : Math.max(cutFrom, e - half);
    if (cutTo - cutFrom <= 0) continue;
    if (cutFrom > pos) parts.push([pos, cutFrom]);
    pos = cutTo;
    cuts++;
  }
  if (pos < len) parts.push([pos, len]);
  const outLen = parts.reduce((n, [a, b]) => n + b - a, 0);
  const fade = Math.round(FADE * rate);
  const out = chans.map((c) => {
    const o = new Float32Array(outLen);
    let at = 0;
    parts.forEach(([a, b], i) => {
      o.set(c.subarray(a, b), at);
      // Fade the edges of each join, not the very start and end of the file.
      const n = Math.min(fade, Math.floor((b - a) / 2));
      for (let k = 0; k < n; k++) {
        const g = k / n;
        if (i > 0) o[at + k]! *= g;
        if (i < parts.length - 1) o[at + (b - a) - 1 - k]! *= g;
      }
      at += b - a;
    });
    return o;
  });
  return { chans: out, removed: (len - outLen) / rate, cuts };
}
