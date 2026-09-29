import { test, expect } from '@playwright/test';
import { Fft, Mdx, INST_HQ_3, pieceSizes, plan, separate } from '../src/lib/mdx';

test('Fft matches a direct DFT for 3·2^k and 2^k sizes, and inverts', () => {
  for (const n of [12, 48, 64]) {
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 1.3) + (i % 5));
    const im = Float64Array.from({ length: n }, (_, i) => Math.cos(i * 0.7));
    const r0 = re.slice(), i0 = im.slice();
    new Fft(n).transform(re, im);
    for (let k = 0; k < n; k++) {
      let sr = 0, si = 0;
      for (let t = 0; t < n; t++) {
        const a = (-2 * Math.PI * k * t) / n;
        sr += r0[t]! * Math.cos(a) - i0[t]! * Math.sin(a);
        si += r0[t]! * Math.sin(a) + i0[t]! * Math.cos(a);
      }
      expect(re[k]).toBeCloseTo(sr, 8);
      expect(im[k]).toBeCloseTo(si, 8);
    }
    new Fft(n).transform(re, im, true);
    for (let t = 0; t < n; t++) expect(re[t]! / n).toBeCloseTo(r0[t]!, 9);
  }
});

test('A spectrogram turned back into sound gives the original, band-limited as the model sees it', () => {
  const mdx = new Mdx(INST_HQ_3);
  const { chunk } = pieceSizes(INST_HQ_3);
  // 440 Hz and 3 kHz: well inside the 3072 bins (up to about 11 kHz at 44.1 kHz).
  const l = Float32Array.from({ length: chunk }, (_, i) => 0.4 * Math.sin((2 * Math.PI * 440 * i) / 44100));
  const r = Float32Array.from({ length: chunk }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 3000 * i) / 44100 + 1));
  const spec = mdx.spectrogram([l, r]);
  expect(spec.length).toBe(4 * 3072 * 256);
  const [yl, yr] = mdx.sound(spec);
  let err = 0;
  for (let i = 0; i < chunk; i++) err = Math.max(err, Math.abs(yl[i]! - l[i]!), Math.abs(yr[i]! - r[i]!));
  expect(err).toBeLessThan(1e-4);
});

test('separate covers the whole song once, in pieces, with an identity network giving the input back', async () => {
  const mdx = new Mdx(INST_HQ_3);
  const n = 300_000;
  expect(plan(n, INST_HQ_3).starts).toEqual([0, 254976]);
  const l = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(i / 30));
  const r = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.cos(i / 17));
  const seen: number[] = [];
  const [yl, yr] = await separate(l, r, mdx, async (s) => s, (d, t) => seen.push(d / t));
  expect(seen).toEqual([0.5, 1]);
  let err = 0;
  for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(yl[i]! - l[i]!), Math.abs(yr[i]! - r[i]!));
  expect(err).toBeLessThan(1e-3);
});
