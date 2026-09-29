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
  const win = Math.round(rate * 0.1);
  let start = 0;
  while (samples.length - start > max * rate) {
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
    cuts.push(best);
    start = best;
  }
  return cuts;
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
