import { test, expect } from '@playwright/test';
import { detectPitch, instrumentById, nearestString, noteFor, noteLabel } from '../src/lib/tuner';

const RATE = 48000;
const tone = (partials: [freq: number, amp: number][], n = 4096, rate = RATE) => {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) for (const [f, a] of partials) out[i]! += a * Math.sin((2 * Math.PI * f * i) / rate + f);
  return out;
};

test('detectPitch reads a pure tone to a fraction of a hertz', () => {
  for (const f of [41.2, 82.41, 196, 440, 1318.5]) {
    const p = detectPitch(tone([[f, 0.3]]), RATE);
    expect(p).toBeDefined();
    expect(Math.abs(1200 * Math.log2(p!.freq / f))).toBeLessThan(2);
    expect(p!.clarity).toBeGreaterThan(0.95);
  }
});

test('detectPitch finds the fundamental of a string whose second harmonic is louder, not an octave up', () => {
  // A low E string: the second and third harmonics carry more energy than the fundamental.
  const p = detectPitch(tone([[82.41, 0.15], [164.82, 0.3], [247.23, 0.2], [329.64, 0.1]]), RATE);
  expect(p).toBeDefined();
  expect(Math.abs(p!.freq - 82.41)).toBeLessThan(0.3);
});

test('detectPitch stays quiet on silence and on noise', () => {
  expect(detectPitch(new Float32Array(4096), RATE)).toBeUndefined();
  let seed = 7;
  const noise = new Float32Array(4096).map(() => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5);
  expect(detectPitch(noise, RATE)).toBeUndefined();
});

test('noteFor names the note and the cents off, with A4 adjustable', () => {
  expect(noteFor(440)).toMatchObject({ name: 'A', octave: 4, midi: 69 });
  const sharp = noteFor(445);
  expect(sharp.name).toBe('A');
  expect(sharp.cents).toBeCloseTo(19.56, 1);
  expect(noteFor(82.41).name + noteFor(82.41).octave).toBe('E2');
  expect(Math.abs(noteFor(82.41).cents)).toBeLessThan(1);
  expect(noteFor(261.63).name).toBe('C');
  expect(noteFor(277.18).name).toBe('C♯');
  // At A4 = 432 Hz, 432 Hz is an A exactly in tune.
  expect(Math.abs(noteFor(432, 432).cents)).toBeLessThan(0.01);
  expect(noteLabel(40)).toBe('E2');
});

test('nearestString picks the closest open string for each instrument', () => {
  const guitar = instrumentById('guitar').strings;
  expect(nearestString(110.5, guitar)).toMatchObject({ index: 1 });
  expect(nearestString(110.5, guitar)!.cents).toBeCloseTo(7.85, 1);
  expect(nearestString(329, guitar)!.index).toBe(5);
  const uke = instrumentById('ukulele').strings;
  expect(nearestString(262, uke)!.index).toBe(1);
  expect(instrumentById('nope').id).toBe('chromatic');
});
