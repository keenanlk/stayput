/**
 * The times Audio splitter reads, typed by hand. The shared parser (audio-split.ts, also used by Split video) reads 12:30, 1:02:45
 * and plain seconds; people also write 90s, 12m30s or 1h2m3s, so this reads those too and hands everything else to the shared
 * parser. The message for a word that is no time is the shared one, with the extra forms added.
 */
import { parseTime, SplitError } from './audio-split';

/** Seconds from "1h2m3s", "12m30s", "90s", "2m" (units h, m, s; in that order; the last number may have a fraction); NaN when it is none of these. */
export function parseUnitTime(text: string): number {
  const m = /^(?:(\d+)h)?(?:(\d+)m(?:in)?)?(?:(\d+(?:\.\d+)?)s(?:ec)?)?$/i.exec(text.trim());
  if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Seconds from any form the splitter accepts; NaN when it is none of them. */
export function parseSplitTime(text: string): number {
  const plain = parseTime(text);
  return Number.isNaN(plain) ? parseUnitTime(text) : plain;
}

/** "12:30, 31:05", "1h2m3s" or one time per line to a list of seconds. */
export function parseSplitTimes(text: string): number[] {
  const words = text.split(/[\s,;]+/).filter(Boolean);
  return words.map((w) => {
    const t = parseSplitTime(w);
    if (Number.isNaN(t)) throw new SplitError(`"${w}" is not a time. Write times like 12:30, 1:02:45, 12m30s or 750 (seconds), separated by commas.`);
    return t;
  });
}
