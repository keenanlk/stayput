/**
 * The audio-in and notes-out maths around Spotify's Basic Pitch network, with no
 * dependencies (the worker in basic-pitch.worker.ts runs the network itself).
 *
 * The network takes 43,844 samples at 22,050 Hz (just under two seconds) and
 * returns 172 frames of 88 note activations and 88 onset activations, one
 * frame every 256 samples. Windows overlap by 30 frames and the outer 15
 * frames of each are dropped, as in Spotify's reference code. The post-processing
 * below follows that code too: onset peaks start notes, a note lasts while its
 * frame activation stays above a threshold, and strong activation left over
 * without an onset becomes a note as well.
 */
import type { MidiNote } from './midi';

export const SAMPLE_RATE = 22050;
export const WINDOW_SAMPLES = 43844;
export const FFT_HOP = 256;
export const WINDOW_FRAMES = 172;
export const PITCHES = 88;
/** MIDI number of the lowest of the 88 pitches (A0). */
export const MIDI_OFFSET = 21;
const OVERLAP_FRAMES = 30;
const OVERLAP_SAMPLES = OVERLAP_FRAMES * FFT_HOP;
/** Samples between window starts. */
export const HOP_SAMPLES = WINDOW_SAMPLES - OVERLAP_SAMPLES;
/** Frames kept from each window. */
export const KEPT_FRAMES = WINDOW_FRAMES - OVERLAP_FRAMES;
const LEAD_PAD = OVERLAP_SAMPLES / 2;
/** Each window's kept frames are this many samples earlier than a plain frame count says. */
const DRIFT_SAMPLES = KEPT_FRAMES * FFT_HOP - HOP_SAMPLES;

/** How many windows cover `length` samples. */
export function windowCount(length: number): number {
  return Math.max(1, Math.ceil((length + LEAD_PAD) / HOP_SAMPLES));
}

/** Window `index` of the audio, with half an overlap of silence in front and zeros past the end. */
export function windowAt(audio: Float32Array, index: number, into = new Float32Array(WINDOW_SAMPLES)): Float32Array {
  const from = index * HOP_SAMPLES - LEAD_PAD;
  into.fill(0);
  const a = Math.max(0, from);
  const b = Math.min(audio.length, from + WINDOW_SAMPLES);
  if (b > a) into.set(audio.subarray(a, b), a - from);
  return into;
}

/** Number of frames that cover `length` samples. */
export const framesFor = (length: number): number => Math.ceil(length / FFT_HOP);

/** Seconds at which model frame `g` (after dropping the overlaps) begins. */
export function frameTime(g: number): number {
  return (g * FFT_HOP - Math.floor(g / KEPT_FRAMES) * DRIFT_SAMPLES) / SAMPLE_RATE;
}

export interface NoteOptions {
  onsetThreshold: number;
  frameThreshold: number;
  /** Notes this many frames or shorter are dropped. */
  minFrames: number;
  /** Frames below the frame threshold in a row that end a note. */
  energyTolerance: number;
}

export const DEFAULTS: NoteOptions = { onsetThreshold: 0.5, frameThreshold: 0.3, minFrames: 11, energyTolerance: 11 };

/** Onsets, raised wherever the frame activation jumps up with no onset peak to explain it. */
function withInferredOnsets(onsets: Float32Array, frames: Float32Array, n: number): Float32Array {
  const nDiff = 2;
  const diff = new Float32Array(n * PITCHES);
  let maxDiff = 0;
  for (let t = nDiff; t < n; t++) {
    for (let p = 0; p < PITCHES; p++) {
      const at = frames[t * PITCHES + p]!;
      const d = Math.max(0, Math.min(at - frames[(t - 1) * PITCHES + p]!, at - frames[(t - 2) * PITCHES + p]!));
      diff[t * PITCHES + p] = d;
      if (d > maxDiff) maxDiff = d;
    }
  }
  let maxOnset = 0;
  for (let i = 0; i < onsets.length; i++) if (onsets[i]! > maxOnset) maxOnset = onsets[i]!;
  const out = new Float32Array(onsets.length);
  const scale = maxDiff > 0 ? maxOnset / maxDiff : 0;
  for (let i = 0; i < out.length; i++) out[i] = Math.max(onsets[i]!, diff[i]! * scale);
  return out;
}

/**
 * Note events from the unwrapped activations: `frames` and `onsets` hold
 * `n` frames of 88 values each, row by row.
 */
export function notesFromActivations(frames: Float32Array, onsets: Float32Array, n: number, options: Partial<NoteOptions> = {}): MidiNote[] {
  const o = { ...DEFAULTS, ...options };
  if (n < 3) return [];
  const peaks = withInferredOnsets(onsets, frames, n);
  const remaining = Float32Array.from(frames);
  const notes: { start: number; end: number; pitch: number; amplitude: number }[] = [];
  const at = (t: number, p: number) => t * PITCHES + p;

  /**
   * The frame where a note that starts at `from` ends: `energyTolerance` quiet frames in a row end it.
   * It reads the energy not yet claimed, so a note stops where a later note of the same pitch starts.
   */
  const walk = (from: number, p: number) => {
    let i = from + 1;
    let k = 0;
    while (i < n - 1 && k < o.energyTolerance) {
      if (remaining[at(i, p)]! < o.frameThreshold) k++;
      else k = 0;
      i++;
    }
    return i - k;
  };
  const claim = (a: number, b: number, p: number) => {
    for (let t = a; t < b; t++) {
      remaining[at(t, p)] = 0;
      if (p < PITCHES - 1) remaining[at(t, p + 1)] = 0;
      if (p > 0) remaining[at(t, p - 1)] = 0;
    }
  };
  const mean = (a: number, b: number, p: number) => {
    let s = 0;
    for (let t = a; t < b; t++) s += frames[at(t, p)]!;
    return s / (b - a);
  };

  // Onset peaks, latest first, as the reference does, so a note cannot run on through a later onset.
  const starts: [number, number][] = [];
  for (let t = 1; t < n - 1; t++) {
    for (let p = 0; p < PITCHES; p++) {
      const v = peaks[at(t, p)]!;
      if (v >= o.onsetThreshold && v > peaks[at(t - 1, p)]! && v > peaks[at(t + 1, p)]!) starts.push([t, p]);
    }
  }
  starts.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [t, p] of starts) {
    if (t >= n - 1) continue;
    const end = walk(t, p);
    if (end - t <= o.minFrames) continue;
    claim(t, end, p);
    notes.push({ start: t, end, pitch: p, amplitude: mean(t, end, p) });
  }

  // Strong activation that no onset explains: the loudest first, grown both ways.
  for (;;) {
    let best = o.frameThreshold;
    let bt = -1;
    let bp = -1;
    for (let t = 0; t < n; t++) {
      for (let p = 0; p < PITCHES; p++) {
        const v = remaining[at(t, p)]!;
        if (v > best) {
          best = v;
          bt = t;
          bp = p;
        }
      }
    }
    if (bt < 0) break;
    remaining[at(bt, bp)] = 0;
    const hi = walk(bt, bp);
    let lo = bt - 1;
    let k = 0;
    while (lo > 0 && k < o.energyTolerance) {
      if (remaining[at(lo, bp)]! < o.frameThreshold) k++;
      else k = 0;
      lo--;
    }
    lo += k;
    claim(lo, hi, bp);
    if (hi - lo <= o.minFrames) continue;
    notes.push({ start: lo, end: hi, pitch: bp, amplitude: mean(lo, hi, bp) });
  }

  return notes
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch)
    .map((x) => ({
      start: frameTime(x.start),
      end: frameTime(x.end),
      pitch: x.pitch + MIDI_OFFSET,
      velocity: Math.max(1, Math.min(127, Math.round(127 * x.amplitude))),
    }));
}

/** Note name with octave, middle C being C4. */
export function noteName(pitch: number): string {
  return `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}
