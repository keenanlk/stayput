import { test, expect } from '@playwright/test';
import { findSilences, removeSilence } from '../src/lib/silence';

const RATE = 8000;
/** Tone and silence in turn: [seconds, loud?]. */
function sound(parts: [number, boolean][]): Float32Array {
  const total = parts.reduce((n, [s]) => n + Math.round(s * RATE), 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const [s, loud] of parts) {
    const n = Math.round(s * RATE);
    if (loud) for (let i = 0; i < n; i++) out[at + i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / RATE);
    at += n;
  }
  return out;
}

test('findSilences finds long pauses, and quiet at the ends whatever its length', () => {
  const s = sound([[0.2, false], [1, true], [0.3, false], [1, true], [1.2, false], [1, true], [0.1, false]]);
  const runs = findSilences([s], RATE, -40, 0.5);
  expect(runs).toHaveLength(3);
  expect(runs[0]).toEqual([0, 0.2 * RATE]);
  expect(runs[1]![0] / RATE).toBeCloseTo(2.5, 1);
  expect((runs[1]![1] - runs[1]![0]) / RATE).toBeCloseTo(1.2, 1);
  expect(runs[2]![1]).toBe(s.length);
});

test('removeSilence shortens a long pause to the chosen gap and trims the ends', () => {
  const s = sound([[0.5, false], [1, true], [2, false], [1, true], [0.5, false]]);
  const r = removeSilence([s, s.slice()], RATE, { thresholdDb: -40, minSilence: 0.5, keep: 0.2 });
  expect(r.chans).toHaveLength(2);
  // 1 s + 0.2 s pause + 1 s.
  expect(r.chans[0]!.length / RATE).toBeCloseTo(2.2, 1);
  expect(r.removed).toBeCloseTo(2.8, 1);
  expect(r.cuts).toBe(3);
});

test('removeSilence leaves short pauses alone and returns the sound unchanged when nothing is quiet', () => {
  const s = sound([[1, true], [0.3, false], [1, true]]);
  const r = removeSilence([s], RATE, { minSilence: 0.5 });
  expect(r.chans[0]!.length).toBe(s.length);
  expect(r.removed).toBe(0);
  expect(r.cuts).toBe(0);
});

test('removeSilence fades each join so no click is left', () => {
  const s = sound([[1, true], [1, false], [1, true]]);
  const [out] = removeSilence([s], RATE, { keep: 0 }).chans;
  // The largest step between neighbouring samples is no bigger than the tone's own
  // (0.3 × 2π × 440 / 8000 ≈ 0.104); a hard cut could jump by up to 0.6.
  let jump = 0;
  for (let i = 1; i < out!.length; i++) jump = Math.max(jump, Math.abs(out![i]! - out![i - 1]!));
  expect(jump).toBeLessThan(0.11);
});
