/**
 * Plan and cut the parts of a split for Audio splitter. Every boundary is one
 * whole sample number, used as the end of a part and the start of the next, so
 * the parts abut exactly: their lengths add up to the whole file and no sample
 * is dropped or repeated. No fades. Nothing leaves the tab.
 */
import { cutChannels } from './audio-trim';
import { baseName } from './files';

/** The most parts one run makes. Each part is encoded and kept in memory, so the page stops here. */
export const MAX_PARTS = 100;

export interface Part {
  /** First sample and one past the last sample, in the decoded sound. */
  from: number;
  to: number;
}

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitError';
  }
}

/** Seconds from "90", "12.5", "12:30", "1:02:45" or "1:02:45.5"; NaN when it is none of these. */
export function parseTime(text: string): number {
  const bits = text.trim().split(':');
  if (bits.length > 3 || bits.some((b) => !/^\d+(\.\d+)?$/.test(b))) return NaN;
  return bits.reduce((sum, b) => sum * 60 + Number(b), 0);
}

/** "12:30, 31:05" or one time per line to a list of seconds. */
export function parseTimes(text: string): number[] {
  const words = text.split(/[\s,;]+/).filter(Boolean);
  return words.map((w) => {
    const t = parseTime(w);
    if (Number.isNaN(t)) throw new SplitError(`"${w}" is not a time. Write times like 12:30, 1:02:45 or 750 (seconds), separated by commas.`);
    return t;
  });
}

const clock = (s: number) => {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

function tooMany(count: number): SplitError {
  return new SplitError(`That would make ${count} parts. This page makes at most ${MAX_PARTS} parts in one run: use fewer times or a longer length.`);
}

/** Parts for a list of times at which each new part starts. */
export function planAtTimes(times: number[], total: number, rate: number): Part[] {
  if (times.length === 0) throw new SplitError('Type at least one time where a new part should start, such as 12:30.');
  const length = total / rate;
  const cuts: number[] = [];
  for (const [i, t] of times.entries()) {
    if (i > 0 && t <= times[i - 1]!) {
      throw new SplitError(
        t === times[i - 1] ? `${clock(t)} is in the list twice. Each time can appear once.` : `The times must go in order, earliest first: ${clock(t)} comes after ${clock(times[i - 1]!)}.`,
      );
    }
    const at = Math.round(t * rate);
    if (at <= 0) throw new SplitError('A time of 0:00 would make an empty first part. Type the times where the later parts start.');
    if (at >= total) throw new SplitError(`${clock(t)} is not inside the file, which is ${clock(length)} long.`);
    if (cuts.length && at <= cuts[cuts.length - 1]!) throw new SplitError(`${clock(t)} is too close to the time before it.`);
    cuts.push(at);
  }
  if (cuts.length + 1 > MAX_PARTS) throw tooMany(cuts.length + 1);
  const edges = [0, ...cuts, total];
  return edges.slice(1).map((to, i) => ({ from: edges[i]!, to }));
}

/** Parts of `seconds` each; the last one is whatever is left. */
export function planEvery(seconds: number, total: number, rate: number): Part[] {
  if (!(seconds > 0)) throw new SplitError('Type a length greater than zero, such as 10 minutes.');
  const step = Math.round(seconds * rate);
  if (step < 1) throw new SplitError('That length is too short.');
  const count = Math.ceil(total / step);
  if (count > MAX_PARTS) throw tooMany(count);
  return Array.from({ length: count }, (_, i) => ({ from: i * step, to: Math.min(total, (i + 1) * step) }));
}

/** The sound of one part. Reads the same sample numbers the plan holds, with no fades. */
export function cutPart(chans: Float32Array[], rate: number, part: Part): Float32Array[] {
  return cutChannels(chans, rate, { start: part.from / rate, end: part.to / rate, fadeIn: 0, fadeOut: 0 });
}

/** `song-part-1.mp3`; the number is zero-padded only when there are 10 or more parts, so they sort. */
export function partName(name: string, index: number, count: number, ext: string): string {
  const width = count >= 10 ? String(count).length : 1;
  return `${baseName(name)}-part-${String(index + 1).padStart(width, '0')}.${ext}`;
}
