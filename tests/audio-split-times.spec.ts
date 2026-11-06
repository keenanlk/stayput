import { test, expect } from '@playwright/test';
import { parseSplitTime, parseSplitTimes } from '../src/lib/audio-split-times';

test('Audio splitter reads 12:30, 1:02:45 and seconds as before, and also 90s, 12m30s and 1h2m3s', () => {
  expect(parseSplitTime('12:30')).toBe(750);
  expect(parseSplitTime('1:02:03')).toBe(3723);
  expect(parseSplitTime('90')).toBe(90);
  expect(parseSplitTime('90s')).toBe(90);
  expect(parseSplitTime('12m30s')).toBe(750);
  expect(parseSplitTime('1h2m3s')).toBe(3723);
  expect(parseSplitTime('2m')).toBe(120);
  expect(parseSplitTime('1h')).toBe(3600);
  expect(parseSplitTime('1.5s')).toBe(1.5);
  expect(parseSplitTime('10MIN')).toBe(600);
  expect(parseSplitTimes('12:30, 31:05\n40m;45s')).toEqual([750, 1865, 2400, 45]);
});

test('words that are no time are named, with the forms that work', () => {
  for (const bad of ['abc', '', 's', 'h2', '1:2:3:4', '-5', '12m30', '5s2m']) expect(parseSplitTime(bad), bad).toBeNaN();
  expect(() => parseSplitTimes('12:30, soon')).toThrow(/"soon" is not a time.*12m30s/);
});
