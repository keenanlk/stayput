/**
 * Join several sounds end to end: silence or a crossfade between them, and
 * mono parts spread to both channels when any part is stereo. Plain sample
 * arithmetic, so it can be tested without a browser.
 */

export type Between = { kind: 'none' } | { kind: 'gap'; seconds: number } | { kind: 'fade'; seconds: number };

/** Parse the "Between tracks" choice: none, gap-1, fade-2 and so on. */
export function parseBetween(value: string): Between {
  const [kind, n] = value.split('-');
  const seconds = Number(n);
  if ((kind === 'gap' || kind === 'fade') && Number.isFinite(seconds) && seconds > 0) return { kind, seconds };
  return { kind: 'none' };
}

/**
 * Lay the parts end to end at `rate`. A crossfade overlaps the end of one part
 * with the start of the next (equal-power curves), and is shortened to half of
 * the shorter part so a short clip is never swallowed.
 */
export function joinParts(parts: Float32Array[][], rate: number, between: Between): Float32Array[] {
  if (parts.length === 0) return [new Float32Array(0)];
  const channels = Math.max(...parts.map((p) => p.length));
  const spread = parts.map((p) => Array.from({ length: channels }, (_, c) => p[Math.min(c, p.length - 1)]!));
  const lengths = spread.map((p) => p[0]!.length);
  const gap = between.kind === 'gap' ? Math.round(between.seconds * rate) : 0;
  const fades = lengths.slice(1).map((len, i) => (between.kind === 'fade' ? Math.min(Math.round(between.seconds * rate), Math.floor(Math.min(len, lengths[i]!) / 2)) : 0));
  const starts: number[] = [];
  let at = 0;
  lengths.forEach((len, i) => {
    if (i > 0) at += gap - fades[i - 1]!;
    starts.push(at);
    at += len;
  });
  const out = Array.from({ length: channels }, () => new Float32Array(at));
  spread.forEach((part, i) => {
    const len = lengths[i]!;
    const fadeIn = i > 0 ? fades[i - 1]! : 0;
    const fadeOut = i < spread.length - 1 ? fades[i]! : 0;
    for (let c = 0; c < channels; c++) {
      const src = part[c]!;
      const dst = out[c]!;
      const base = starts[i]!;
      for (let k = 0; k < len; k++) {
        let g = 1;
        if (k < fadeIn) g *= Math.sin(((k + 0.5) / fadeIn) * (Math.PI / 2));
        if (k >= len - fadeOut) g *= Math.cos(((k - (len - fadeOut) + 0.5) / fadeOut) * (Math.PI / 2));
        dst[base + k]! += src[k]! * g;
      }
    }
  });
  return out;
}
