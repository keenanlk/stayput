import { test, expect } from '@playwright/test';
import { cutPart, MAX_PARTS, parseTime, parseTimes, partName, planAtTimes, planEvery } from '../src/lib/audio-split';

const RATE = 44100;
const total = (n: number) => Math.round(n * RATE);

/** A ramp, so every sample is distinct and a dropped or repeated one shows. */
const ramp = (n: number) => [Float32Array.from({ length: n }, (_, i) => i), Float32Array.from({ length: n }, (_, i) => -i)];

test('parseTime reads m:ss, h:mm:ss and plain seconds', () => {
  expect(parseTime('12:30')).toBe(750);
  expect(parseTime('1:02:45')).toBe(3765);
  expect(parseTime('90')).toBe(90);
  expect(parseTime('0:12.5')).toBe(12.5);
  expect(parseTime('abc')).toBeNaN();
  expect(parseTime('1:2:3:4')).toBeNaN();
  expect(parseTime('-5')).toBeNaN();
  expect(parseTimes('12:30, 31:05\n40:00;45')).toEqual([750, 1865, 2400, 45]);
  expect(() => parseTimes('12:30, soon')).toThrow(/"soon" is not a time/);
});

test('parts split at times abut: their sample counts add up to the whole, and no sample is lost or repeated', () => {
  const n = total(62 * 60 + 7.3);
  const parts = planAtTimes([parseTime('11:30'), parseTime('24:10'), parseTime('41:45')], n, RATE);
  expect(parts).toHaveLength(4);
  expect(parts[0]!.from).toBe(0);
  expect(parts[3]!.to).toBe(n);
  parts.slice(1).forEach((p, i) => expect(p.from, `part ${i + 2} starts where part ${i + 1} ended`).toBe(parts[i]!.to));
  expect(parts.reduce((sum, p) => sum + (p.to - p.from), 0)).toBe(n);
});

test('cut parts concatenate back to the exact original samples', () => {
  const n = total(20.123456);
  const chans = ramp(n);
  for (const parts of [planAtTimes([3.3333, 7.00001, 7.5, 19.9], n, RATE), planEvery(2.7, n, RATE), planEvery(1 / 3, n, RATE)]) {
    const cut = parts.map((p) => cutPart(chans, RATE, p));
    expect(cut.reduce((sum, c) => sum + c[0]!.length, 0)).toBe(n);
    for (const c of [0, 1]) {
      const joined = new Float32Array(n);
      let at = 0;
      for (const part of cut) {
        joined.set(part[c]!, at);
        at += part[c]!.length;
      }
      expect(joined).toEqual(chans[c]);
    }
  }
});

test('every N makes equal parts and a shorter last one', () => {
  const parts = planEvery(600, total(25 * 60), RATE);
  expect(parts.map((p) => (p.to - p.from) / RATE)).toEqual([600, 600, 300]);
  // An exact multiple makes no empty trailing part.
  expect(planEvery(10, total(30), RATE)).toHaveLength(3);
});

test('bad times say what to fix, and the part cap is stated', () => {
  const n = total(100);
  expect(() => planAtTimes([], n, RATE)).toThrow(/at least one time/);
  expect(() => planAtTimes([30, 20], n, RATE)).toThrow(/in order/);
  expect(() => planAtTimes([30, 30], n, RATE)).toThrow(/twice/);
  expect(() => planAtTimes([0], n, RATE)).toThrow(/0:00/);
  expect(() => planAtTimes([100], n, RATE)).toThrow(/not inside the file, which is 1:40 long/);
  expect(() => planAtTimes([500], n, RATE)).toThrow(/not inside the file/);
  expect(() => planEvery(0, n, RATE)).toThrow(/greater than zero/);
  expect(MAX_PARTS).toBe(100);
  expect(() => planEvery(0.5, n, RATE)).toThrow(`That would make 200 parts. This page makes at most ${MAX_PARTS} parts in one run`);
  const many = Array.from({ length: MAX_PARTS }, (_, i) => i + 1);
  expect(() => planAtTimes(many, total(500), RATE)).toThrow(/at most 100 parts/);
  expect(planEvery(1, total(MAX_PARTS), RATE)).toHaveLength(MAX_PARTS);
});

test('part names are zero-padded only when there are 10 or more parts', () => {
  expect(partName('rehearsal.wav', 0, 4, 'mp3')).toBe('rehearsal-part-1.mp3');
  expect(partName('rehearsal.wav', 8, 9, 'mp3')).toBe('rehearsal-part-9.mp3');
  expect(partName('rehearsal.wav', 0, 10, 'wav')).toBe('rehearsal-part-01.wav');
  expect(partName('rehearsal.wav', 9, 10, 'wav')).toBe('rehearsal-part-10.wav');
  expect(partName('a.b.mp3', 99, 100, 'mp3')).toBe('a.b-part-100.mp3');
  expect(partName('a.mp3', 0, 100, 'mp3')).toBe('a-part-001.mp3');
});
