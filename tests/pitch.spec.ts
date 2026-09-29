import { test, expect } from '@playwright/test';
import { resample, semitoneRatio, speedAndPitch } from '../src/lib/pitch';

const RATE = 48_000;
const sine = (hz: number, seconds: number) => {
  const a = new Float32Array(Math.round(RATE * seconds));
  for (let i = 0; i < a.length; i++) a[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE);
  return a;
};
/** Frequency from rising zero crossings, ignoring the edges. */
const freq = (a: Float32Array) => {
  const from = Math.floor(a.length * 0.1);
  const to = Math.floor(a.length * 0.9);
  let n = 0;
  for (let i = from + 1; i < to; i++) if (a[i - 1]! < 0 && a[i]! >= 0) n++;
  return n / ((to - from) / RATE);
};

test('resample by a ratio makes the sound shorter and higher by that ratio', () => {
  const [out] = resample([sine(440, 1)], 2);
  expect(out!.length).toBe(RATE / 2);
  expect(freq(out!)).toBeCloseTo(880, -1);
});

test('pitch moves by semitones while the length stays the same', () => {
  const [out] = speedAndPitch([sine(440, 1.5)], 1, semitoneRatio(3));
  expect(Math.abs(out!.length - RATE * 1.5)).toBeLessThan(RATE * 0.02);
  expect(Math.abs(freq(out!) - 440 * semitoneRatio(3))).toBeLessThan(6);
  const [down] = speedAndPitch([sine(440, 1.5)], 1, semitoneRatio(-12));
  expect(Math.abs(freq(down!) - 220)).toBeLessThan(4);
});

test('speed changes the length and keeps the pitch; both can change together', () => {
  const [fast] = speedAndPitch([sine(440, 2)], 1.5, 1);
  expect(Math.abs(fast!.length - (RATE * 2) / 1.5)).toBeLessThan(RATE * 0.02);
  expect(Math.abs(freq(fast!) - 440)).toBeLessThan(5);
  const [both] = speedAndPitch([sine(440, 2)], 0.8, semitoneRatio(-2));
  expect(Math.abs(both!.length - (RATE * 2) / 0.8)).toBeLessThan(RATE * 0.02);
  expect(Math.abs(freq(both!) - 440 * semitoneRatio(-2))).toBeLessThan(5);
});
