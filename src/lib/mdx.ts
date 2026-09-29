/**
 * The signal processing around an MDX-Net source-separation model (the kind
 * Ultimate Vocal Remover uses): the short-time Fourier transform that turns a
 * stretch of stereo sound into the spectrogram the network reads, the inverse
 * that turns its answer back into sound, and how a whole song is cut into
 * pieces the network can take. It matches torch.stft / torch.istft with
 * center=True, reflect padding and a periodic Hann window, as the models were
 * trained with. Pure functions, so they run in a worker and in Node tests.
 */

export interface MdxConfig {
  nFft: number;
  hop: number;
  /** Frequency bins the network sees (the rest are zero). */
  dimF: number;
  /** Frames per piece. */
  dimT: number;
}

/** UVR-MDX-NET-Inst_HQ_3. */
export const INST_HQ_3: MdxConfig = { nFft: 6144, hop: 1024, dimF: 3072, dimT: 256 };

/** Samples per piece the network takes, and the context trimmed from each end. */
export function pieceSizes(c: MdxConfig) {
  const chunk = c.hop * (c.dimT - 1);
  const trim = c.nFft / 2;
  return { chunk, trim, gen: chunk - 2 * trim };
}

/**
 * A complex FFT for sizes of 2^k or 3·2^k (6144 is 3·2048): the input is split
 * into three interleaved halves, each transformed by an iterative radix-2 FFT,
 * and combined.
 */
export class Fft {
  readonly n: number;
  private readonly m: number;
  private readonly radix: 1 | 3;
  private readonly rev: Uint32Array;
  private readonly cosM: Float64Array;
  private readonly sinM: Float64Array;
  private readonly cosN: Float64Array;
  private readonly sinN: Float64Array;
  private readonly sub: Float64Array[];

  constructor(n: number) {
    this.n = n;
    this.radix = n % 3 === 0 ? 3 : 1;
    this.m = n / this.radix;
    if (this.m & (this.m - 1)) throw new Error(`FFT size ${n} is not 2^k or 3·2^k`);
    const bits = Math.log2(this.m);
    this.rev = new Uint32Array(this.m);
    for (let i = 0; i < this.m; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cosM = new Float64Array(this.m / 2);
    this.sinM = new Float64Array(this.m / 2);
    for (let i = 0; i < this.m / 2; i++) {
      this.cosM[i] = Math.cos((2 * Math.PI * i) / this.m);
      this.sinM[i] = Math.sin((2 * Math.PI * i) / this.m);
    }
    this.cosN = new Float64Array(n);
    this.sinN = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.cosN[i] = Math.cos((2 * Math.PI * i) / n);
      this.sinN[i] = Math.sin((2 * Math.PI * i) / n);
    }
    this.sub = Array.from({ length: 2 * this.radix }, () => new Float64Array(this.m));
  }

  /** In place. `inverse` uses the positive exponent and does not divide by n. */
  transform(re: Float64Array, im: Float64Array, inverse = false) {
    const { m, radix, n } = this;
    const sign = inverse ? 1 : -1;
    if (radix === 1) return this.radix2(re, im, sign);
    for (let r = 0; r < 3; r++) {
      const sr = this.sub[2 * r]!;
      const si = this.sub[2 * r + 1]!;
      for (let j = 0; j < m; j++) {
        sr[j] = re[3 * j + r]!;
        si[j] = im[3 * j + r]!;
      }
      this.radix2(sr, si, sign);
    }
    const [r0, i0, r1, i1, r2, i2] = this.sub as [Float64Array, Float64Array, Float64Array, Float64Array, Float64Array, Float64Array];
    for (let k = 0; k < n; k++) {
      const j = k & (m - 1);
      const k2 = (2 * k) % n;
      const c1 = this.cosN[k]!, s1 = sign * this.sinN[k]!;
      const c2 = this.cosN[k2]!, s2 = sign * this.sinN[k2]!;
      re[k] = r0[j]! + (r1[j]! * c1 - i1[j]! * s1) + (r2[j]! * c2 - i2[j]! * s2);
      im[k] = i0[j]! + (r1[j]! * s1 + i1[j]! * c1) + (r2[j]! * s2 + i2[j]! * c2);
    }
  }

  private radix2(re: Float64Array, im: Float64Array, sign: number) {
    const m = this.m;
    const rev = this.rev;
    for (let i = 0; i < m; i++) {
      const j = rev[i]!;
      if (j > i) {
        let t = re[i]!; re[i] = re[j]!; re[j] = t;
        t = im[i]!; im[i] = im[j]!; im[j] = t;
      }
    }
    for (let size = 2; size <= m; size *= 2) {
      const half = size / 2;
      const step = m / size;
      for (let start = 0; start < m; start += size) {
        for (let k = 0; k < half; k++) {
          const c = this.cosM[k * step]!;
          const s = sign * this.sinM[k * step]!;
          const a = start + k;
          const b = a + half;
          const tr = re[b]! * c - im[b]! * s;
          const ti = re[b]! * s + im[b]! * c;
          re[b] = re[a]! - tr;
          im[b] = im[a]! - ti;
          re[a]! += tr;
          im[a]! += ti;
        }
      }
    }
  }
}

function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

export class Mdx {
  readonly cfg: MdxConfig;
  private readonly fft: Fft;
  private readonly window: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(cfg: MdxConfig) {
    this.cfg = cfg;
    this.fft = new Fft(cfg.nFft);
    this.window = hann(cfg.nFft);
    this.re = new Float64Array(cfg.nFft);
    this.im = new Float64Array(cfg.nFft);
  }

  /**
   * One piece of stereo sound (each channel `chunk` samples) to the network's
   * input, [1, 4, dimF, dimT]: left real, left imaginary, right real, right imaginary.
   */
  spectrogram(channels: [Float32Array, Float32Array]): Float32Array {
    const { nFft, hop, dimF, dimT } = this.cfg;
    const half = nFft / 2;
    const out = new Float32Array(4 * dimF * dimT);
    const { re, im, window } = this;
    channels.forEach((x, c) => {
      const len = x.length;
      // Reflect padding, as torch.stft(center=True, pad_mode='reflect').
      const at = (i: number) => x[i < 0 ? -i : i >= len ? 2 * len - 2 - i : i]!;
      for (let f = 0; f < dimT; f++) {
        const start = f * hop - half;
        for (let i = 0; i < nFft; i++) {
          re[i] = at(start + i) * window[i]!;
          im[i] = 0;
        }
        this.fft.transform(re, im);
        const baseRe = (2 * c) * dimF * dimT;
        const baseIm = (2 * c + 1) * dimF * dimT;
        for (let b = 0; b < dimF; b++) {
          out[baseRe + b * dimT + f] = re[b]!;
          out[baseIm + b * dimT + f] = im[b]!;
        }
      }
    });
    return out;
  }

  /** The network's output, [1, 4, dimF, dimT], back to stereo sound of `chunk` samples. */
  sound(spec: Float32Array): [Float32Array, Float32Array] {
    const { nFft, hop, dimF, dimT } = this.cfg;
    const half = nFft / 2;
    const chunk = hop * (dimT - 1);
    const { re, im, window } = this;
    const result: Float32Array[] = [];
    for (let c = 0; c < 2; c++) {
      const acc = new Float64Array(chunk + nFft);
      const norm = new Float64Array(chunk + nFft);
      const baseRe = (2 * c) * dimF * dimT;
      const baseIm = (2 * c + 1) * dimF * dimT;
      for (let f = 0; f < dimT; f++) {
        re.fill(0);
        im.fill(0);
        for (let b = 0; b < dimF; b++) {
          re[b] = spec[baseRe + b * dimT + f]!;
          im[b] = spec[baseIm + b * dimT + f]!;
        }
        // A real signal's spectrum is conjugate-symmetric; the bins above dimF stay zero.
        for (let b = 1; b < half; b++) {
          re[nFft - b] = re[b]!;
          im[nFft - b] = -im[b]!;
        }
        im[0] = 0;
        this.fft.transform(re, im, true);
        const o = f * hop;
        for (let i = 0; i < nFft; i++) {
          acc[o + i]! += (re[i]! / nFft) * window[i]!;
          norm[o + i]! += window[i]! * window[i]!;
        }
      }
      const y = new Float32Array(chunk);
      for (let i = 0; i < chunk; i++) {
        const w = norm[i + half]!;
        y[i] = w > 1e-11 ? acc[i + half]! / w : 0;
      }
      result.push(y);
    }
    return result as [Float32Array, Float32Array];
  }
}

/** Where each piece of a song of `n` samples starts in the padded signal, and how much padding goes at the end. */
export function plan(n: number, c: MdxConfig): { starts: number[]; pad: number } {
  const { gen } = pieceSizes(c);
  const pad = gen - (n % gen);
  const starts: number[] = [];
  for (let i = 0; i < n + pad; i += gen) starts.push(i);
  return { starts, pad };
}

/**
 * Separate a whole song. `run` sends one spectrogram to the network and
 * returns its output. The song is padded with `trim` samples of silence at
 * each end, cut into overlapping pieces, and the middle of each answer kept.
 */
export async function separate(
  left: Float32Array,
  right: Float32Array,
  mdx: Mdx,
  run: (spec: Float32Array) => Promise<Float32Array>,
  onPiece?: (done: number, total: number) => void,
): Promise<[Float32Array, Float32Array]> {
  const n = left.length;
  const { chunk, trim, gen } = pieceSizes(mdx.cfg);
  const { starts, pad } = plan(n, mdx.cfg);
  const padded = (x: Float32Array) => {
    const p = new Float32Array(trim + n + pad + trim);
    p.set(x, trim);
    return p;
  };
  const pl = padded(left);
  const pr = padded(right);
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  for (const [i, s] of starts.entries()) {
    const spec = mdx.spectrogram([pl.subarray(s, s + chunk), pr.subarray(s, s + chunk)]);
    const [yl, yr] = mdx.sound(await run(spec));
    const keep = Math.min(gen, n - s);
    if (keep > 0) {
      outL.set(yl.subarray(trim, trim + keep), s);
      outR.set(yr.subarray(trim, trim + keep), s);
    }
    onPiece?.(i + 1, starts.length);
  }
  return [outL, outR];
}
