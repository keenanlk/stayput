import { test, expect } from '@playwright/test';
import { captionAt, clean, cutPoints, fitCaptions, parseSubtitles, toSrt, toText, toVtt, wrap } from '../src/lib/captions';

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

test('parseSubtitles reads SRT and WebVTT, dropping numbers, headers and tags', () => {
  const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i> there\r\nsecond line\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n{\\an8}Bye\r\n';
  expect(parseSubtitles(srt)).toEqual([
    { start: 1, end: 2.5, text: 'Hello there\nsecond line' },
    { start: 3, end: 4, text: 'Bye' },
  ]);
  const vtt = 'WEBVTT\n\nNOTE made by hand\n\ncue-1\n01:05.250 --> 01:06.000 align:start\n<v Anna>Hi\n\n1:00:00.000 --> 1:00:01.000\nLate\n';
  expect(parseSubtitles(vtt)).toEqual([
    { start: 65.25, end: 66, text: 'Hi' },
    { start: 3600, end: 3601, text: 'Late' },
  ]);
  expect(parseSubtitles(toSrt([{ start: 0.5, end: 1.25, text: 'Round trip' }]))).toEqual([{ start: 0.5, end: 1.25, text: 'Round trip' }]);
});

test('fitCaptions wraps to the width and splits long captions into timed two-line pieces', () => {
  const measure = (s: string) => s.length;
  expect(wrap('one two three four', measure, 9)).toEqual(['one two', 'three', 'four']);
  expect(wrap('日本語の字幕です', measure, 3)).toEqual(['日本語', 'の字幕', 'です']);
  const fitted = fitCaptions([{ start: 0, end: 6, text: 'aaaa bbbb cccc dddd eeee ffff' }], measure, 9);
  expect(fitted.map((s) => s.text)).toEqual(['aaaa bbbb\ncccc dddd', 'eeee ffff']);
  expect(fitted[0]!.start).toBe(0);
  expect(fitted[0]!.end).toBeCloseTo(4, 5);
  expect(fitted[1]!.end).toBe(6);
  expect(captionAt(fitted, 1)?.text).toBe('aaaa bbbb\ncccc dddd');
  expect(captionAt(fitted, 5)?.text).toBe('eeee ffff');
  expect(captionAt(fitted, 6)).toBeUndefined();
});
