/**
 * Timing for the metronome. Clicks are scheduled ahead on the Web Audio
 * clock, which runs on the sound card, so the beat stays steady even when the
 * page's timers are late; this module works out when each click falls.
 */

export const MIN_BPM = 20;
export const MAX_BPM = 300;

export const clampBpm = (bpm: number) => Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)));

/** Clicks per beat for each subdivision. */
export const subdivisions: Record<string, number> = { none: 1, eighths: 2, triplets: 3, sixteenths: 4 };

export interface Click {
  /** Time on the audio clock, in seconds. */
  time: number;
  /** Beat within the bar, from 0. */
  beat: number;
  /** Subdivision within the beat, from 0 (0 is the beat itself). */
  sub: number;
}

/**
 * The clicks from `from` (inclusive) up to `until` (exclusive), counting from
 * a start time on the audio clock. Returns the clicks and the index of the
 * next click so scheduling can carry on where it stopped.
 */
export function clicksBetween(start: number, index: number, until: number, bpm: number, beatsPerBar: number, perBeat: number): { clicks: Click[]; next: number } {
  const step = 60 / bpm / perBeat;
  const clicks: Click[] = [];
  let i = index;
  while (start + i * step < until) {
    const beatIndex = Math.floor(i / perBeat);
    clicks.push({ time: start + i * step, beat: beatIndex % beatsPerBar, sub: i % perBeat });
    i++;
  }
  return { clicks, next: i };
}

/**
 * The tempo from a run of taps (times in milliseconds). Uses the median gap
 * of the last eight taps, so one early or late tap does not throw it off. A
 * pause of more than two seconds starts a new run.
 */
export function bpmFromTaps(taps: number[]): number | undefined {
  let run = taps;
  for (let i = taps.length - 1; i > 0; i--) {
    if (taps[i]! - taps[i - 1]! > 2000) {
      run = taps.slice(i);
      break;
    }
  }
  run = run.slice(-8);
  if (run.length < 2) return undefined;
  const gaps = run.slice(1).map((t, i) => t - run[i]!).sort((a, b) => a - b);
  const mid = gaps.length / 2;
  const gap = gaps.length % 2 ? gaps[Math.floor(mid)]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
  return gap > 0 ? clampBpm(60000 / gap) : undefined;
}

/** The traditional Italian name for a tempo, as printed on sheet music. */
export function tempoName(bpm: number): string {
  if (bpm < 40) return 'Grave';
  if (bpm < 60) return 'Largo';
  if (bpm < 66) return 'Larghetto';
  if (bpm < 76) return 'Adagio';
  if (bpm < 108) return 'Andante';
  if (bpm < 120) return 'Moderato';
  if (bpm < 156) return 'Allegro';
  if (bpm < 176) return 'Vivace';
  if (bpm < 200) return 'Presto';
  return 'Prestissimo';
}
