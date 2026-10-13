/**
 * A streaming sample-rate converter for the sound of old files (11 to 32 kHz mono is common),
 * which AAC encoders refuse or write wrongly (see aacSafeSampleRate). Lanczos-windowed sinc,
 * eight lobes: pictures of the same sound at 48 kHz are clean enough for speech and music
 * that was 22 kHz to begin with. Chunks go in one at a time; the tail of each is kept for the next.
 */
const LOBES = 8;

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

export class Resampler {
  private readonly step: number;
  private readonly scale: number;
  /** Input samples not yet fully used, per channel. */
  private tail: Float32Array[];
  /** Position of the next output sample in `tail` plus the new chunk, in input samples. */
  private pos = 0;

  constructor(
    readonly fromRate: number,
    readonly toRate: number,
    readonly channels: number,
  ) {
    this.step = fromRate / toRate;
    // Below the output Nyquist when going down; 1 (no filtering) when going up.
    this.scale = Math.min(1, toRate / fromRate);
    // Start with silence before the first sample so the first output sees a full kernel.
    this.tail = Array.from({ length: channels }, () => new Float32Array(LOBES));
    this.pos = LOBES;
  }

  /** Converts one chunk (one array per channel, equal lengths). Returns the output ready so far. */
  push(chunk: Float32Array[]): Float32Array[] {
    const n = chunk[0]!.length;
    const joined = this.tail.map((t, c) => {
      const a = new Float32Array(t.length + n);
      a.set(t);
      a.set(chunk[c]!, t.length);
      return a;
    });
    const total = joined[0]!.length;
    // An output sample at x needs inputs up to x + LOBES / scale.
    const reach = Math.ceil(LOBES / this.scale);
    const out: number[][] = Array.from({ length: this.channels }, () => []);
    let x = this.pos;
    while (x + reach < total) {
      const i0 = Math.floor(x);
      const from = i0 - reach + 1;
      for (let c = 0; c < this.channels; c++) {
        const src = joined[c]!;
        let sum = 0;
        let norm = 0;
        for (let i = from; i <= i0 + reach; i++) {
          const d = (x - i) * this.scale;
          if (Math.abs(d) >= LOBES) continue;
          const w = sinc(d) * sinc(d / LOBES);
          sum += (src[i] ?? 0) * w;
          norm += w;
        }
        out[c]!.push(norm ? sum / norm : 0);
      }
      x += this.step;
    }
    // Keep what the next outputs still need.
    const keepFrom = Math.max(0, Math.floor(x) - reach + 1);
    this.tail = joined.map((a) => a.slice(keepFrom));
    this.pos = x - keepFrom;
    return out.map((a) => Float32Array.from(a));
  }

  /** The last few samples, once the input has ended (padded with silence). */
  finish(): Float32Array[] {
    return this.push(Array.from({ length: this.channels }, () => new Float32Array(Math.ceil(LOBES / this.scale) + 1)));
  }
}
