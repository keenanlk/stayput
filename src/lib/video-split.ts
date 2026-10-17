/**
 * Plan the parts of a video split for Video splitter. The plan is in seconds:
 * each part ends where the next begins, so together they cover the whole video.
 * Cutting is done by video-trim.ts, one part at a time. Nothing leaves the tab.
 */
import { parseTimes, SplitError } from './audio-split';
import { baseName } from './files';
import { NamedError, UnreadableFile } from './input-error';
import { nameBare } from './bare-error';
import { isNotReadable, notReadable } from './read-failure';

/** The shortest part a run makes: a sliver shorter than this holds no picture a player will show. */
export const MIN_PART_SECONDS = 0.1;

/** A plan that cannot be made. Each cause has its own name, which is all a failed run records (never the message). */
const plan = (name: string, message: string) => new NamedError(name, message);

/** The most parts one run makes. Every part is held in memory until the zip is written. */
export const MAX_VIDEO_PARTS = 50;

export interface VideoPart {
  /** Seconds from the start of the video. */
  start: number;
  end: number;
}

const clock = (s: number) => {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

function tooMany(count: number): Error {
  return plan('SplitTooManyParts', `That would make ${count} parts. This page makes at most ${MAX_VIDEO_PARTS} parts in one run: use fewer times or a longer length.`);
}

/** The parts, or a refusal when one is too short to hold a picture (a very short clip, or two times a hair apart). */
function tooShort(parts: VideoPart[]): VideoPart[] {
  const sliver = parts.find((p) => p.end - p.start < MIN_PART_SECONDS - 1e-9);
  if (sliver) throw plan('SplitPartTooShort', `A part would be only ${(sliver.end - sliver.start).toFixed(2)} seconds long. Parts must be at least ${MIN_PART_SECONDS} seconds: use fewer parts or times further apart.`);
  return parts;
}

/** Parts that run through the given edges (the first is 0, the last the length). */
const between = (edges: number[]): VideoPart[] => edges.slice(1).map((end, i) => ({ start: edges[i]!, end }));

/** Parts for a list of times at which each new part starts, e.g. "1:30, 4:00". */
export function planAtTimes(text: string, duration: number): VideoPart[] {
  let times: number[];
  try {
    times = parseTimes(text);
  } catch (e) {
    throw e instanceof SplitError ? plan('SplitBadTime', e.message) : e;
  }
  if (times.length === 0) throw plan('SplitNoTimes', 'Type at least one time where a new part should start, such as 1:30.');
  for (const [i, t] of times.entries()) {
    if (t <= 0) throw plan('SplitTimeAtStart', 'A time of 0:00 would make an empty first part. Type the times where the later parts start.');
    if (t >= duration) throw plan('SplitTimeOutOfRange', `${clock(t)} is not inside the video, which is ${clock(duration)} long.`);
    if (i > 0 && t === times[i - 1]) throw plan('SplitTimeRepeated', `${clock(t)} is in the list twice. Each time can appear once.`);
    if (i > 0 && t < times[i - 1]!) throw plan('SplitTimeOrder', `The times must go in order, earliest first: ${clock(t)} comes after ${clock(times[i - 1]!)}.`);
  }
  if (times.length + 1 > MAX_VIDEO_PARTS) throw tooMany(times.length + 1);
  return tooShort(between([0, ...times, duration]));
}

/** Parts of `seconds` each; the last one is whatever is left. */
export function planEvery(seconds: number, duration: number): VideoPart[] {
  if (!(seconds > 0)) throw plan('SplitBadLength', 'Type a length greater than zero, such as 30 seconds.');
  if (seconds >= duration) throw plan('SplitLengthTooLong', `${clock(seconds)} is as long as the whole video (${clock(duration)}), so there is nothing to split. Type a shorter length.`);
  const count = Math.ceil(duration / seconds - 1e-9);
  if (count > MAX_VIDEO_PARTS) throw tooMany(count);
  return tooShort(Array.from({ length: count }, (_, i) => ({ start: i * seconds, end: Math.min(duration, (i + 1) * seconds) })));
}

/** `count` parts of the same length. */
export function planEqual(count: number, duration: number): VideoPart[] {
  if (!Number.isInteger(count) || count < 2) throw plan('SplitBadCount', 'Type a whole number of parts, 2 or more.');
  if (count > MAX_VIDEO_PARTS) throw tooMany(count);
  return tooShort(Array.from({ length: count }, (_, i) => ({ start: (duration * i) / count, end: (duration * (i + 1)) / count })));
}

export interface SplitSettings {
  mode: 'times' | 'every' | 'equal';
  /** The times box, for 'times'. */
  times: string;
  /** Seconds per part, for 'every'. */
  everySeconds: number;
  /** Number of parts, for 'equal'. */
  parts: number;
}

/**
 * The parts these settings make for a video of `duration` seconds, or a named error that says what to fix. The one
 * check of a cut list: the page calls it to keep Run off while the list is bad, and again when Run is pressed.
 */
export function planFor(settings: SplitSettings, duration: number): VideoPart[] {
  if (!(duration > 0)) throw plan('SplitNoLength', 'This video has no length this page can read.');
  if (settings.mode === 'every') return planEvery(settings.everySeconds, duration);
  if (settings.mode === 'equal') return planEqual(settings.parts, duration);
  return planAtTimes(settings.times, duration);
}

/** `holiday-part-01.mp4`: two digits at least, so the parts sort. */
export function videoPartName(name: string, index: number, count: number, ext: string): string {
  const width = Math.max(2, String(count).length);
  return `${baseName(name)}-part-${String(index + 1).padStart(width, '0')}.${ext}`;
}

/**
 * Seconds in the file, from its container. A file the phone cannot read keeps the name NotReadableError (so a job can
 * read it once more); anything else that goes wrong here is named for what it was.
 */
export async function readDuration(file: File): Promise<number> {
  const { BlobSource, Input, MATROSKA, MP4, QTFF, WEBM } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const format = await input.getFormat().catch((e) => {
      if (isNotReadable(e)) throw notReadable(e);
      return null;
    });
    if (!format) throw new UnreadableFile('This file is not a video this page can read (MP4, MOV, WebM or MKV).');
    const track = await input.getPrimaryVideoTrack().catch((e) => {
      if (isNotReadable(e)) throw notReadable(e);
      throw nameBare('VideoReadFailed', e);
    });
    if (!track) throw new UnreadableFile('This file has no video track.');
    const seconds = await input.computeDuration().catch((e) => {
      if (isNotReadable(e)) throw notReadable(e);
      throw nameBare('VideoReadFailed', e);
    });
    if (!Number.isFinite(seconds) || seconds <= 0) throw new UnreadableFile('Could not tell how long this video is.');
    return seconds;
  } finally {
    input.dispose?.();
  }
}
