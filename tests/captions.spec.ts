import { test, expect } from '@playwright/test';
import { clean, cutPoints, toSrt, toText, toVtt } from '../src/lib/captions';

const RATE = 1000;
/** Loud everywhere except short silences at the given seconds. */
function speech(seconds: number, gaps: number[]): Float32Array {
  const out = new Float32Array(seconds * RATE);
  for (let i = 0; i < out.length; i++) out[i] = 0.3 * Math.sin(i);
  for (const g of gaps) out.fill(0, g * RATE, (g + 0.3) * RATE);
  return out;
}

test('cutPoints splits a long recording at pauses, every piece at most 28 s', () => {
  const s = speech(70, [22, 47]);
  const cuts = cutPoints(s, RATE);
  expect(cuts).toHaveLength(2);
  expect(cuts[0]! / RATE).toBeGreaterThanOrEqual(22);
  expect(cuts[0]! / RATE).toBeLessThanOrEqual(22.3);
  expect(cuts[1]! / RATE).toBeGreaterThanOrEqual(47);
  expect(cuts[1]! / RATE).toBeLessThanOrEqual(47.3);
  const edges = [0, ...cuts, s.length];
  for (let i = 1; i < edges.length; i++) expect((edges[i]! - edges[i - 1]!) / RATE).toBeLessThanOrEqual(28);
  expect(cutPoints(speech(20, []), RATE)).toEqual([]);
});

test('SRT, WebVTT and text are written from the segments', () => {
  const segs = clean([
    { start: 0, end: 2.5, text: '  Hello  there. ' },
    { start: 2.5, end: 3, text: '[MUSIC]' },
    { start: 3661.25, end: 3663, text: 'An hour later.' },
  ]);
  expect(segs).toHaveLength(2);
  expect(toSrt(segs)).toBe('1\n00:00:00,000 --> 00:00:02,500\nHello there.\n\n2\n01:01:01,250 --> 01:01:03,000\nAn hour later.\n');
  expect(toVtt(segs)).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nHello there.\n\n01:01:01.250 --> 01:01:03.000\nAn hour later.\n');
  expect(toText(segs)).toBe('Hello there.\n\nAn hour later.\n');
});
