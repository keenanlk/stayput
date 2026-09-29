import { test, expect } from '@playwright/test';
import { joinParts, parseBetween } from '../src/lib/audio-merge';

const ones = (n: number, v = 1) => new Float32Array(n).fill(v);

test('joinParts lays parts end to end, with silence between when asked', () => {
  const [mono] = joinParts([[ones(3)], [ones(2, 0.5)]], 10, { kind: 'none' });
  expect([...mono!]).toEqual([1, 1, 1, 0.5, 0.5]);
  const [gapped] = joinParts([[ones(2)], [ones(2)]], 10, parseBetween('gap-0.3'));
  expect([...gapped!]).toEqual([1, 1, 0, 0, 0, 1, 1]);
});

test('joinParts spreads a mono part to both channels when another part is stereo', () => {
  const out = joinParts([[ones(2)], [ones(1, 0.25), ones(1, 0.75)]], 10, { kind: 'none' });
  expect(out).toHaveLength(2);
  expect([...out[0]!]).toEqual([1, 1, 0.25]);
  expect([...out[1]!]).toEqual([1, 1, 0.75]);
});

test('joinParts crossfades with equal power and never swallows a short part', () => {
  const rate = 100;
  const [x] = joinParts([[ones(300)], [ones(300)]], rate, parseBetween('fade-1'));
  // One second (100 samples) of overlap: 500 samples in all.
  expect(x!.length).toBe(500);
  // In the overlap the two curves' powers add to one, so a steady tone stays close to its level.
  const mid = x![250]!;
  expect(mid).toBeGreaterThan(1.3);
  expect(mid).toBeLessThan(1.45);
  expect(x![0]).toBe(1);
  expect(x![499]).toBe(1);
  // A 40-sample part limits the fade to 20 samples.
  const [short] = joinParts([[ones(300)], [ones(40)]], rate, parseBetween('fade-2'));
  expect(short!.length).toBe(320);
});

test('parseBetween reads the choice, and anything unexpected means no gap', () => {
  expect(parseBetween('gap-2')).toEqual({ kind: 'gap', seconds: 2 });
  expect(parseBetween('fade-3')).toEqual({ kind: 'fade', seconds: 3 });
  expect(parseBetween('none')).toEqual({ kind: 'none' });
  expect(parseBetween('gap-x')).toEqual({ kind: 'none' });
});
