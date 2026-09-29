import { expect, test } from '@playwright/test';
import { bitrateToFit } from '../src/lib/audio-fit';

/** How Compress audio picks a bitrate for a size limit. */

test('with no limit the chosen quality is used', () => {
  expect(bitrateToFit(128, 3600, null)).toBe(128);
  expect(bitrateToFit(64, 10, null)).toBe(64);
});

test('a long file drops to the highest bitrate that fits the limit', () => {
  // An hour under 25 MB: at most 53.9 kbps, so 48.
  expect(bitrateToFit(128, 3600, 25)).toBe(48);
  // Ten minutes under 8 MB: at most 103 kbps, so 96.
  expect(bitrateToFit(128, 600, 8)).toBe(96);
  // A short file keeps the chosen quality.
  expect(bitrateToFit(128, 60, 8)).toBe(128);
});

test('a file too long for any bitrate gets the lowest one', () => {
  expect(bitrateToFit(128, 36000, 8)).toBe(32);
});
