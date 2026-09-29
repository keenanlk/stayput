/**
 * Cut a part out of decoded sound, with optional fades, for Trim audio. The
 * sound is decoded by the browser (see audio.ts) and written as MP3 or WAV;
 * nothing leaves the tab.
 */

export interface CutOptions {
  start: number;
  end: number;
  /** Seconds of fade at the start and at the end; 0 for none. */
  fadeIn: number;
  fadeOut: number;
}

/** The samples between start and end (in seconds), faded in and out as asked. */
export function cutChannels(chans: Float32Array[], sampleRate: number, opts: CutOptions): Float32Array[] {
  const total = chans[0]?.length ?? 0;
  const a = Math.max(0, Math.min(total, Math.round(opts.start * sampleRate)));
  const b = Math.max(a, Math.min(total, Math.round(opts.end * sampleRate)));
  const n = b - a;
  const fin = Math.min(n >> 1, Math.round(opts.fadeIn * sampleRate));
  const fout = Math.min(n >> 1, Math.round(opts.fadeOut * sampleRate));
  return chans.map((ch) => {
    const out = ch.slice(a, b);
    for (let i = 0; i < fin; i++) out[i]! *= i / fin;
    for (let i = 0; i < fout; i++) out[n - 1 - i]! *= i / fout;
    return out;
  });
}

/** Loudest sample in each of `bars` slices, for drawing a waveform. */
export function peaks(chans: Float32Array[], bars: number): Float32Array {
  const total = chans[0]?.length ?? 0;
  const out = new Float32Array(bars);
  if (!total) return out;
  const per = total / bars;
  for (let i = 0; i < bars; i++) {
    const from = Math.floor(i * per);
    const to = Math.min(total, Math.max(from + 1, Math.floor((i + 1) * per)));
    // Sampling every few samples is plenty for a picture and keeps long files quick.
    const stride = Math.max(1, Math.floor((to - from) / 400));
    let m = 0;
    for (const ch of chans) for (let j = from; j < to; j += stride) m = Math.max(m, Math.abs(ch[j]!));
    out[i] = m;
  }
  return out;
}
