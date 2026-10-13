import { test, expect } from '@playwright/test';
import { defaultHighBitrate, matchedBitrate } from '../src/lib/output-bitrate';

// The bitrate a re-encoded video is given, so a phone clip does not come out much bigger than it went in.
const UHD = 3840 * 2160;
const HD = 1920 * 1080;

test.describe('matchedBitrate', () => {
  test('4K H.264 at 13.7 Mbit/s asks for about the same, not the 22.8 Mbit/s the default would write', () => {
    const wanted = matchedBitrate(13_700_000, 'avc', UHD, UHD);
    expect(wanted).toBe(13_700_000);
    expect(defaultHighBitrate(UHD)).toBeGreaterThan(22_000_000);
  });

  test('1080p output of a 4K clip gets about a third of the bits, not a quarter', () => {
    const wanted = matchedBitrate(13_700_000, 'avc', UHD, HD)!;
    expect(wanted).toBeGreaterThan(4_500_000);
    expect(wanted).toBeLessThan(5_200_000);
  });

  test('a source above what the default gives leaves the default alone', () => {
    expect(matchedBitrate(40_000_000, 'avc', HD, HD)).toBeUndefined();
  });

  test('HEVC gets half as many bits again, as H.264 needs more for the same picture', () => {
    expect(matchedBitrate(10_000_000, 'hevc', UHD, UHD)).toBe(15_000_000);
  });

  test('never below 1 Mbit/s, and unknown figures leave the default', () => {
    expect(matchedBitrate(200_000, 'avc', HD, HD)).toBe(1_000_000);
    expect(matchedBitrate(0, 'avc', HD, HD)).toBeUndefined();
    expect(matchedBitrate(Number.NaN, 'avc', HD, HD)).toBeUndefined();
  });

  test('a bigger output than the source does not raise it', () => {
    expect(matchedBitrate(5_000_000, 'avc', HD, UHD)).toBe(5_000_000);
  });
});
