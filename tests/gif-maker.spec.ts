import { test, expect } from '@playwright/test';
import { frameSize, place, playOrder } from '../src/lib/gif-maker';

test('frameSize keeps the first picture’s shape, never enlarges it, and uses even sides', () => {
  expect(frameSize({ width: 4032, height: 3024 }, 480)).toEqual({ width: 480, height: 360 });
  expect(frameSize({ width: 300, height: 200 }, 640)).toEqual({ width: 300, height: 200 });
  expect(frameSize({ width: 1001, height: 1001 }, 1001)).toEqual({ width: 1000, height: 1000 });
});

test('place shows the whole picture centred, or fills the frame and crops the overflow', () => {
  // A portrait photo in a landscape frame.
  const whole = place(300, 600, 400, 300, 'contain');
  expect(whole).toMatchObject({ sx: 0, sy: 0, sw: 300, sh: 600, dy: 0, dh: 300, dw: 150, dx: 125 });
  const fill = place(300, 600, 400, 300, 'cover');
  expect(fill).toMatchObject({ dx: 0, dy: 0, dw: 400, dh: 300, sx: 0, sw: 300 });
  expect(fill.sh).toBeCloseTo(225);
  expect(fill.sy).toBeCloseTo(187.5);
});

test('playOrder runs there and back without doubling the ends', () => {
  expect(playOrder(4, false)).toEqual([0, 1, 2, 3]);
  expect(playOrder(4, true)).toEqual([0, 1, 2, 3, 2, 1]);
  expect(playOrder(2, true)).toEqual([0, 1]);
});
