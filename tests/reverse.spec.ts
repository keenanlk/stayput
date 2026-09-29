import { expect, test } from '@playwright/test';
import { reverseWindows } from '../src/lib/video-reverse';

/** How Reverse video splits a video into pieces to decode, last first. */

test('reverse windows follow keyframes and cover the whole video once, last first', () => {
  const w = reverseWindows([0, 2, 4], 0, 5, 3);
  expect(w).toEqual([[4, 5], [2, 4], [0, 2]]);
});

test('a long stretch between keyframes is split into windows that fit in memory', () => {
  const w = reverseWindows([0], 0, 2.5, 1);
  expect(w).toEqual([[1.5, 2.5], [0.5, 1.5], [0, 0.5]]);
  // Together the windows cover the video with no gaps.
  const sorted = [...w].reverse();
  for (let i = 1; i < sorted.length; i++) expect(sorted[i]![0]).toBeCloseTo(sorted[i - 1]![1]);
});

test('a video that does not start at zero or lists no keyframes still gets windows', () => {
  expect(reverseWindows([], 0.5, 1.5, 2)).toEqual([[0.5, 1.5]]);
});
