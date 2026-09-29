/**
 * Pitch detection and note maths for the tuner. The pitch is found with the
 * McLeod pitch method: the normalised square difference of the sound with a
 * delayed copy of itself peaks at each multiple of the period, and the first
 * peak close to the highest one is the fundamental. That keeps a guitar's
 * strong second harmonic from reading an octave high.
 */

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

export interface Instrument {
  id: string;
  label: string;
  /** Open strings, low to high, as MIDI note numbers. */
  strings: number[];
}

export const instruments: Instrument[] = [
  { id: 'chromatic', label: 'Chromatic (any instrument or voice)', strings: [] },
  { id: 'guitar', label: 'Guitar, standard (E A D G B E)', strings: [40, 45, 50, 55, 59, 64] },
  { id: 'drop-d', label: 'Guitar, drop D (D A D G B E)', strings: [38, 45, 50, 55, 59, 64] },
  { id: 'bass', label: 'Bass, 4 strings (E A D G)', strings: [28, 33, 38, 43] },
  { id: 'ukulele', label: 'Ukulele, standard (G C E A)', strings: [67, 60, 64, 69] },
  { id: 'ukulele-low-g', label: 'Ukulele, low G (G C E A)', strings: [55, 60, 64, 69] },
  { id: 'violin', label: 'Violin (G D A E)', strings: [55, 62, 69, 76] },
];

export const instrumentById = (id: string) => instruments.find((i) => i.id === id) ?? instruments[0]!;

/** Frequency of a MIDI note with A4 (MIDI 69) at `a4` Hz. */
export const midiToFreq = (midi: number, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);

export interface Note {
  midi: number;
  name: string;
  octave: number;
  /** How far the sound is from the note, −50 to +50 (sharp is positive). */
  cents: number;
}

/** The nearest note to a frequency, and how many cents off it is. */
export function noteFor(freq: number, a4 = 440): Note {
  const exact = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(exact);
  return { midi, name: NOTE_NAMES[((midi % 12) + 12) % 12]!, octave: Math.floor(midi / 12) - 1, cents: (exact - midi) * 100 };
}

/** Name of a MIDI note with its octave, as "E2". */
export const noteLabel = (midi: number) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

/** The string whose open note is closest to the frequency, and the cents from it. */
export function nearestString(freq: number, strings: number[], a4 = 440): { index: number; cents: number } | undefined {
  let best: { index: number; cents: number } | undefined;
  strings.forEach((midi, index) => {
    const cents = 1200 * Math.log2(freq / midiToFreq(midi, a4));
    if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { index, cents };
  });
  return best;
}

export interface Pitch {
  freq: number;
  /** 0 to 1: how periodic the sound is. Plucked strings read above 0.9. */
  clarity: number;
}

/**
 * The fundamental frequency of a buffer of samples, or undefined when the
 * sound is too quiet or not clearly pitched.
 */
export function detectPitch(buf: Float32Array, rate: number, { minHz = 30, maxHz = 1500, minClarity = 0.8, minRms = 0.008 } = {}): Pitch | undefined {
  const n = buf.length;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i]! * buf[i]!;
  if (Math.sqrt(energy / n) < minRms) return undefined;
  const maxTau = Math.min(n - 2, Math.ceil(rate / minHz));
  const minTau = Math.max(2, Math.floor(rate / maxHz));
  const nsdf = new Float32Array(maxTau + 2);
  // m(τ) shrinks by the squares of the samples that fall off each end as τ grows.
  let m = 2 * energy;
  for (let tau = 0; tau <= maxTau + 1; tau++) {
    let r = 0;
    for (let j = 0; j < n - tau; j++) r += buf[j]! * buf[j + tau]!;
    nsdf[tau] = m > 0 ? (2 * r) / m : 0;
    m -= buf[tau]! * buf[tau]! + buf[n - 1 - tau]! * buf[n - 1 - tau]!;
  }
  // One peak per positive lobe, starting after the lobe around τ = 0.
  const peaks: number[] = [];
  let tau = 1;
  while (tau <= maxTau && nsdf[tau]! > 0) tau++;
  while (tau <= maxTau) {
    while (tau <= maxTau && nsdf[tau]! <= 0) tau++;
    let best = -1;
    while (tau <= maxTau && nsdf[tau]! > 0) {
      if (tau >= minTau && (best < 0 || nsdf[tau]! > nsdf[best]!)) best = tau;
      tau++;
    }
    if (best > 0) peaks.push(best);
  }
  if (!peaks.length) return undefined;
  const highest = Math.max(...peaks.map((p) => nsdf[p]!));
  const pick = peaks.find((p) => nsdf[p]! >= 0.9 * highest)!;
  // A parabola through the peak and its neighbours places it between samples.
  const a = nsdf[pick - 1]!;
  const b = nsdf[pick]!;
  const c = nsdf[pick + 1]!;
  const den = a - 2 * b + c;
  const shift = den ? (0.5 * (a - c)) / den : 0;
  const clarity = Math.min(1, b - 0.25 * (a - c) * shift);
  if (clarity < minClarity) return undefined;
  const freq = rate / (pick + shift);
  return freq >= minHz && freq <= maxHz ? { freq, clarity } : undefined;
}
