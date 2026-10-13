import { test, expect } from '@playwright/test';
import { detectPitch, instrumentById, isDecayOctaveJump, midiToFreq, nearestString, noteFor, noteLabel } from '../src/lib/tuner';

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

test('the string instruments have the right open strings, as notes and as frequencies', () => {
  const expected: Record<string, { notes: string[]; hz: number[] }> = {
    violin: { notes: ['G3', 'D4', 'A4', 'E5'], hz: [196, 293.66, 440, 659.26] },
    bass: { notes: ['E1', 'A1', 'D2', 'G2'], hz: [41.2, 55, 73.42, 98] },
    cello: { notes: ['C2', 'G2', 'D3', 'A3'], hz: [65.41, 98, 146.83, 220] },
    // Open G, in the order players name it: the short fifth string first.
    banjo: { notes: ['G4', 'D3', 'G3', 'B3', 'D4'], hz: [392, 146.83, 196, 246.94, 293.66] },
    mandolin: { notes: ['G3', 'D4', 'A4', 'E5'], hz: [196, 293.66, 440, 659.26] },
  };
  for (const [id, want] of Object.entries(expected)) {
    const strings = instrumentById(id).strings;
    expect(instrumentById(id).id, id).toBe(id);
    expect(strings.map(noteLabel), id).toEqual(want.notes);
    strings.forEach((m, i) => expect(midiToFreq(m)).toBeCloseTo(want.hz[i]!, 1));
  }
  expect(instrumentById('chromatic').strings).toEqual([]);
});

test('cello, banjo and bass open strings are read as themselves, an octave off is a long way off', () => {
  const cello = instrumentById('cello').strings;
  const c2 = detectPitch(tone([[65.41, 0.3]]), RATE);
  expect(c2).toBeDefined();
  expect(nearestString(c2!.freq, cello)).toMatchObject({ index: 0 });
  expect(Math.abs(nearestString(c2!.freq, cello)!.cents)).toBeLessThan(2);
  // A viola's A4 against the cello list is an octave from A3, so the needle pins.
  expect(nearestString(440, cello)!.cents).toBeCloseTo(1200, 0);
  const banjo = instrumentById('banjo').strings;
  expect(nearestString(392, banjo)).toMatchObject({ index: 0 });
  expect(nearestString(146.83, banjo)).toMatchObject({ index: 1 });
  // Four-string bass: its low E is 41.2 Hz.
  const bass = instrumentById('bass').strings;
  expect(nearestString(41.2, bass)).toMatchObject({ index: 0 });
  expect(Math.abs(nearestString(41.2, bass)!.cents)).toBeLessThan(0.5);
});

test('a note whose fundamental is weak against its harmonics, like a cello C2 or a banjo G4, still reads as the fundamental', () => {
  // Harmonic levels measured on recorded notes: cello C2 about 0.1 : 1 : 0.7 : 0.85 : 0.5.
  const cello = detectPitch(tone([[65.41, 0.03], [130.82, 0.3], [196.23, 0.21], [261.64, 0.25], [327.05, 0.15]]), RATE);
  expect(cello).toBeDefined();
  expect(Math.abs(1200 * Math.log2(cello!.freq / 65.41))).toBeLessThan(5);
  // Banjo G4: 0.4 : 1 : 0.3 : 0.1.
  const banjo = detectPitch(tone([[392, 0.12], [784, 0.3], [1176, 0.09], [1568, 0.03]]), RATE);
  expect(banjo).toBeDefined();
  expect(Math.abs(1200 * Math.log2(banjo!.freq / 392))).toBeLessThan(3);
});

test('below the 30 Hz floor reads nothing, and a note just above it is read', () => {
  expect(detectPitch(tone([[27.5, 0.3]]), RATE)).toBeUndefined();
  const b0 = detectPitch(tone([[30.87, 0.3], [61.74, 0.2], [92.61, 0.1]]), RATE);
  expect(b0).toBeDefined();
  expect(Math.abs(1200 * Math.log2(b0!.freq / 30.87))).toBeLessThan(5);
});

test('an octave jump while the sound is dying away is held; a louder one is a new note', () => {
  // Banjo G4 tail: the fundamental has faded and the second harmonic reads an octave up.
  const tail = detectPitch(tone([[392, 0.004], [784, 0.02]]), RATE);
  expect(tail).toBeDefined();
  expect(tail!.freq).toBeGreaterThan(780);
  expect(isDecayOctaveJump(tail!.freq, 392, 0.014, 0.016)).toBe(true);
  // The same reading on a louder window is a new pluck.
  expect(isDecayOctaveJump(tail!.freq, 392, 0.2, 0.016)).toBe(false);
  // Other jumps, and the same note, are not octave jumps.
  expect(isDecayOctaveJump(392, 392, 0.014, 0.016)).toBe(false);
  expect(isDecayOctaveJump(588, 392, 0.014, 0.016)).toBe(false);
  expect(isDecayOctaveJump(196, 392, 0.014, 0.016)).toBe(false);
});
