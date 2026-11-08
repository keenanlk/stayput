/**
 * Timed text for Transcribe: where to cut a long recording into pieces the
 * speech model can take, and the text, SRT and WebVTT files made from the
 * timed segments it returns.
 */

export interface Segment {
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  text: string;
}

/**
 * Cut points (in samples) that split `samples` into pieces of at most `max`
 * seconds, each cut at the quietest tenth of a second in the last third of
 * the piece, so words are not split in half.
 */
export function cutPoints(samples: Float32Array, rate: number, max = 28, min = 18): number[] {
  const cuts: number[] = [];
  let start = 0;
  while (samples.length - start > max * rate) {
    const best = nextCut(samples, start, rate, max, min);
    cuts.push(best);
    start = best;
  }
  return cuts;
}

/** Where the piece starting at `start` ends: the quietest tenth of a second between `min` and `max` seconds on. Needs more than `max` seconds after `start`. */
export function nextCut(samples: Float32Array, start: number, rate: number, max = 28, min = 18): number {
  const win = Math.round(rate * 0.1);
  let best = start + max * rate;
  let quietest = Infinity;
  for (let a = start + min * rate; a + win <= start + max * rate; a += win) {
    let sum = 0;
    for (let i = a; i < a + win; i++) sum += samples[i]! * samples[i]!;
    if (sum < quietest) {
      quietest = sum;
      best = a + Math.floor(win / 2);
    }
  }
  return best;
}

/** Tidy the model's text: collapse spaces and drop empty or bracketed non-speech lines. */
export function clean(segments: Segment[]): Segment[] {
  return segments
    .map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text && !/^[[(].*[\])]$/.test(s.text) && s.end >= s.start);
}

function stamp(seconds: number, sep: ',' | '.'): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export function toSrt(segments: Segment[]): string {
  return segments.map((s, i) => `${i + 1}\n${stamp(s.start, ',')} --> ${stamp(s.end, ',')}\n${s.text}\n`).join('\n');
}

export function toVtt(segments: Segment[]): string {
  return `WEBVTT\n\n${segments.map((s) => `${stamp(s.start, '.')} --> ${stamp(s.end, '.')}\n${s.text}\n`).join('\n')}`;
}

/** Plain text in paragraphs: a new paragraph wherever the speaker paused for two seconds or more. */
export function toText(segments: Segment[]): string {
  const paras: string[][] = [];
  segments.forEach((s, i) => {
    if (i === 0 || s.start - segments[i - 1]!.end >= 2) paras.push([]);
    paras.at(-1)!.push(s.text);
  });
  return `${paras.map((p) => p.join(' ')).join('\n\n')}\n`;
}

/** "00:01:02,500", "01:02.5" or "1:02:03.250" to seconds; NaN when it is not a time. */
function parseStamp(s: string): number {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(s.trim());
  if (!m) return NaN;
  const [, h = '0', min, sec, frac = '0'] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(sec) + Number(frac.padEnd(3, '0')) / 1000;
}

/** Whether the text is an Advanced SubStation (.ass) or SubStation (.ssa) script, which keeps its captions as Dialogue lines. */
export function looksLikeAss(file: string): boolean {
  return /^\s*\[(?:Script Info|Events|V4\+? Styles)\]/im.test(file) && /^\s*Dialogue:/im.test(file);
}

/** The words of an ASS caption: override blocks dropped, \N and \n as line breaks, \h as a space. */
const assText = (raw: string) =>
  raw
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');

/** Read the Dialogue lines of an .ass or .ssa script (the [Events] Format line says which field is which; the text is the last and may hold commas). */
function parseAss(file: string): Segment[] {
  const out: Segment[] = [];
  let fields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
  for (const line of file.split('\n')) {
    const format = /^\s*Format:\s*(.*)$/i.exec(line);
    if (format && /\btext\b/i.test(format[1]!) && /\bstart\b/i.test(format[1]!)) {
      fields = format[1]!.split(',').map((f) => f.trim().toLowerCase());
      continue;
    }
    const dialogue = /^\s*Dialogue:\s*(.*)$/i.exec(line);
    if (!dialogue) continue;
    const parts = dialogue[1]!.split(',');
    const textAt = fields.indexOf('text');
    const startAt = fields.indexOf('start');
    const endAt = fields.indexOf('end');
    if (textAt < 0 || startAt < 0 || endAt < 0 || parts.length <= textAt) continue;
    const start = parseStamp(parts[startAt]!);
    const end = parseStamp(parts[endAt]!);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const text = assText(parts.slice(textAt).join(','));
    if (text) out.push({ start, end, text });
  }
  return out.sort((x, y) => x.start - y.start);
}

/**
 * Read an SRT, WebVTT or ASS/SSA file into timed segments. Numbering, VTT headers,
 * notes and styling tags are dropped; a caption's lines are kept as lines.
 */
export function parseSubtitles(file: string): Segment[] {
  const out: Segment[] = [];
  const text = file.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (looksLikeAss(text)) return parseAss(text);
  const blocks = text.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at]!.split('-->');
    const start = parseStamp(a!);
    const end = parseStamp(b!.trim().split(/\s+/)[0]!);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const text = lines
      .slice(at + 1)
      .map((l) => l.replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').trim())
      .filter(Boolean)
      .join('\n');
    if (text) out.push({ start, end, text });
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Scripts written without spaces between words; these wrap between characters. */
const UNSPACED = /[぀-ヿ㐀-鿿豈-﫿฀-๿຀-໿က-႟ក-៿]/;

/** Break `text` into lines no wider than `maxWidth`, as measured by `measure`. */
export function wrap(text: string, measure: (s: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const unspaced = UNSPACED.test(para);
    const units = unspaced ? [...para.replace(/\s+/g, '')] : para.split(/\s+/).filter(Boolean);
    const glue = unspaced ? '' : ' ';
    let line = '';
    for (const u of units) {
      const next = line ? line + glue + u : u;
      if (line && measure(next) > maxWidth) {
        lines.push(line);
        line = u;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Captions sized for burning into a picture: each segment is wrapped to
 * `maxWidth`, and one that needs more than `maxLines` lines becomes several
 * captions in a row, its time shared out by length.
 */
export function fitCaptions(segments: Segment[], measure: (s: string) => number, maxWidth: number, maxLines = 2): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const lines = wrap(s.text, measure, maxWidth);
    const groups: string[][] = [];
    for (let i = 0; i < lines.length; i += maxLines) groups.push(lines.slice(i, i + maxLines));
    const total = lines.reduce((n, l) => n + l.length, 0) || 1;
    let t = s.start;
    for (const g of groups) {
      const share = g.reduce((n, l) => n + l.length, 0) / total;
      const end = g === groups.at(-1) ? s.end : t + (s.end - s.start) * share;
      out.push({ start: t, end, text: g.join('\n') });
      t = end;
    }
  }
  return out;
}

/** The caption showing at `seconds`, or undefined between captions. Segments must be sorted. */
export function captionAt(segments: Segment[], seconds: number): Segment | undefined {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid]!;
    if (seconds < s.start) hi = mid - 1;
    else if (seconds >= s.end) lo = mid + 1;
    else return s;
  }
  return undefined;
}

/**
 * Captions that can be looked up by time: sorted, and none overlapping the next. A caption that starts while another is
 * showing cuts the first short at its start, and two that start together become one caption with both texts, so a
 * file with overlapping times draws every caption instead of losing some to the lookup.
 */
export function tidyCaptions(segments: Segment[]): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Segment[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && s.start - last.start < 0.001) {
      last.end = Math.max(last.end, s.end);
      if (!last.text.split('\n').includes(s.text)) last.text += `\n${s.text}`;
      continue;
    }
    if (last && last.end > s.start) last.end = s.start;
    out.push({ ...s });
  }
  return out.filter((s) => s.end > s.start);
}
