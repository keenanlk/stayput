/**
 * Tempo and key from plain samples, with no DOM, so the page, its worker and
 * the tests all use the same code.
 *
 * Tempo is music-tempo (MIT), a BeatRoot port that assumes 44.1 kHz. The key is
 * our own: a harmonic-salience chroma matched against the 24 Krumhansl-Kessler
 * key profiles (Krumhansl and Kessler, 1982, "Tracing the dynamic changes in
 * perceived tonal organization in a spatial representation of musical keys",
 * Psychological Review 89).
 *
 * Accuracy, measured on 15 recordings with a known label (6 synthesised, 9
 * real; labels not independently verified), headline tempo folded to 70-180:
 * within 2% on 13, half or double on 1 or 2, wrong on 0 or 1. Key: exact on 7,
 * relative major or minor on 3, a fifth away on 2, other mode on 1, wrong on
 * 2. The page copy quotes the raw-tempo and key figures; re-measure and edit
 * the copy together if the detector changes.
 */
import MusicTempo from 'music-tempo';
import { fft } from './fft';

export type Mode = 'major' | 'minor';

// Krumhansl and Kessler (1982) probe-tone ratings, tonic first.
const KK: Record<Mode, number[]> = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};

/** Note names, sharps only, with C as 0. */
export const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** Camelot number of the major key on each tonic (0 = C); a minor key takes its relative major's number. */
const CAM_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];

export const camelot = (tonic: number, mode: Mode): string =>
  mode === 'major' ? `${CAM_MAJOR[tonic]}B` : `${CAM_MAJOR[(tonic + 3) % 12]}A`;

export const keyName = (tonic: number, mode: Mode): string => `${NAMES[tonic]} ${mode}`;

/** The relative key: the minor three semitones below a major, the major three above a minor. */
export function relativeOf(tonic: number, mode: Mode): { tonic: number; mode: Mode } {
  return mode === 'major' ? { tonic: (tonic + 9) % 12, mode: 'minor' } : { tonic: (tonic + 3) % 12, mode: 'major' };
}

/** Move by whole octaves into [lo, hi). */
export function foldTempo(bpm: number, lo = 70, hi = 180): number {
  let b = bpm;
  while (b >= hi) b /= 2;
  while (b < lo) b *= 2;
  return b;
}

export interface TempoResult {
  /** The detector's own number. */
  raw: number;
  /** Folded into 70 to 180. */
  bpm: number;
}

/** `mono44k`: samples at 44,100 Hz (music-tempo assumes it). Returns null when no steady beat is found. */
export function analyseTempo(mono44k: Float32Array): TempoResult | null {
  try {
    const raw = Number(new MusicTempo(mono44k).tempo);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return { raw, bpm: foldTempo(raw) };
  } catch {
    // music-tempo throws a string when it finds no beats.
    return null;
  }
}

export interface KeyResult {
  tonic: number;
  mode: Mode;
  /** Correlation of the winning profile with the song's note content. */
  r: number;
  second: { tonic: number; mode: Mode; r: number };
  camelot: string;
  tuningCents: number;
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** `x22`: samples at 22,050 Hz (the 44.1 kHz mono array with each pair averaged). Null when there is too little, or no sound. */
export function analyseKey(x22: Float32Array, sr = 22050): KeyResult | null {
  const N = 8192;
  const hop = 4096;
  const hz = sr / N;
  const lowM = 33;
  const highM = 84;
  const H = 8;
  const DECAY = 0.84;
  const frames = Math.floor((x22.length - N) / hop);
  if (frames < 2) return null;
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const specs: Float32Array[] = [];
  const energy: number[] = [];
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) {
      re[i] = x22[f * hop + i]! * win[i]!;
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float32Array(N / 2);
    let e = 0;
    for (let b = 0; b < N / 2; b++) {
      mag[b] = Math.sqrt(Math.hypot(re[b]!, im[b]!));
      e += mag[b]!;
    }
    specs.push(mag);
    energy.push(e);
  }
  if (!energy.some((e) => e > 1e-6)) return null;

  // Salience of each MIDI note 33..84 (A1..C6): decaying sum over its first 8 harmonics.
  const salience = (mag: Float32Array, tune: number) => {
    const out = new Float64Array(highM - lowM + 1);
    for (let m = lowM; m <= highM; m++) {
      const f0 = 440 * 2 ** ((m + tune - 69) / 12);
      let s = 0;
      for (let h = 1; h <= H; h++) {
        const b = Math.round((h * f0) / hz);
        if (b >= N / 2 - 2) break;
        s += DECAY ** (h - 1) * Math.max(mag[b - 1]!, mag[b]!, mag[b + 1]!);
      }
      out[m - lowM] = s;
    }
    return out;
  };

  // Tuning: the offset (-0.4..0.4 semitone, 0.1 steps) that maximises salience, on every 4th frame.
  let tune = 0;
  let best = -1;
  for (const t of [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4]) {
    let e = 0;
    for (let f = 0; f < frames; f += 4) for (const v of salience(specs[f]!, t)) e += v * v;
    if (e > best) {
      best = e;
      tune = t;
    }
  }

  // Skip the quietest 20% of frames; per frame, square what is above the frame's mean salience.
  const gate = [...energy].sort((a, b) => a - b)[Math.floor(energy.length * 0.2)]!;
  const chroma = new Float64Array(12);
  for (let f = 0; f < frames; f++) {
    if (energy[f]! < gate) continue;
    const s = salience(specs[f]!, tune);
    let mean = 0;
    for (const v of s) mean += v;
    mean /= s.length;
    const c = new Float64Array(12);
    let tot = 0;
    s.forEach((v, i) => {
      const w = Math.max(0, v - mean);
      c[(lowM + i) % 12]! += w * w;
      tot += w * w;
    });
    if (tot > 0) for (let i = 0; i < 12; i++) chroma[i]! += c[i]! / tot;
  }
  if (!chroma.some((v) => v > 0)) return null;

  // 24 candidates: tonic t, profile rotated so its first value sits on t; best Pearson r wins.
  const scored: { tonic: number; mode: Mode; r: number }[] = [];
  for (const mode of ['major', 'minor'] as const) {
    for (let t = 0; t < 12; t++) {
      const rotated = Array.from({ length: 12 }, (_, i) => KK[mode][(i - t + 12) % 12]!);
      scored.push({ tonic: t, mode, r: pearson(chroma, rotated) });
    }
  }
  scored.sort((a, b) => b.r - a.r);
  const [win1, win2] = scored as [(typeof scored)[number], (typeof scored)[number]];
  return { ...win1, second: win2, camelot: camelot(win1.tonic, win1.mode), tuningCents: Math.round(tune * 100) };
}

/** Halve a 44.1 kHz array to 22.05 kHz by averaging each pair of samples. */
export function halve(x: Float32Array): Float32Array {
  const out = new Float32Array(x.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = (x[2 * i]! + x[2 * i + 1]!) / 2;
  return out;
}

export type Confidence = 'likely' | 'unsure';

/** "Likely" at a correlation of 0.75 or more: in our test 9 of 10 such keys were exact or relative, against 1 of 5 below. */
export const confidenceLabel = (r: number): Confidence => (r >= 0.75 ? 'likely' : 'unsure');

/** The half and double of a tempo, when both are plausible (half at least 40, double at most 240). */
export function alsoReadAs(bpm: number): [number, number] | null {
  const half = Math.round(bpm / 2);
  const double = Math.round(bpm * 2);
  return half >= 40 && double <= 240 ? [half, double] : null;
}

/** The two analyses together, as the worker runs them. `mono44k` is not changed. */
export function analyse(mono44k: Float32Array): { tempo: TempoResult | null; key: KeyResult | null } {
  return { tempo: analyseTempo(mono44k), key: analyseKey(halve(mono44k)) };
}

export interface ResultRow {
  name: string;
  duration: number;
  tempo: TempoResult | null;
  key: KeyResult | null;
}

export const CSV_HEADER = 'file,duration_seconds,bpm,bpm_raw,key,camelot,relative_key,relative_camelot,key_confidence';

/** A CSV field: always quoted, quotes doubled, and a leading = + - @ neutralised so a spreadsheet does not run it. */
function field(text: string): string {
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function resultsCsv(rows: ResultRow[]): string {
  const lines = rows.map((row) => {
    const { key, tempo } = row;
    const rel = key ? relativeOf(key.tonic, key.mode) : null;
    return [
      field(row.name),
      row.duration.toFixed(1),
      tempo ? tempo.bpm.toFixed(1) : '',
      tempo ? tempo.raw.toFixed(1) : '',
      key ? keyName(key.tonic, key.mode) : '',
      key ? key.camelot : '',
      rel ? keyName(rel.tonic, rel.mode) : '',
      rel ? camelot(rel.tonic, rel.mode) : '',
      key ? confidenceLabel(key.r) : '',
    ].join(',');
  });
  return [CSV_HEADER, ...lines].join('\n') + '\n';
}
