import { expect, test } from '@playwright/test';
import { planGrid } from '../src/lib/image-grid';

/** How Split image cuts a picture into tiles. */

test('a 3 by 3 grid of the original shape uses whole tiles, centred', () => {
  const g = planGrid(1000, 800, 3, 3, 'original');
  expect(g.tileW).toBe(333);
  expect(g.tileH).toBe(266);
  expect(g.crop).toEqual({ x: 0, y: 1, w: 999, h: 798 });
  expect(g.tiles).toHaveLength(9);
  expect(g.tiles[4]).toMatchObject({ row: 1, col: 1, x: 333, y: 267 });
});

test('square tiles crop a wide photo to the middle', () => {
  const g = planGrid(3000, 1000, 3, 1, 'square');
  expect(g.tileW).toBe(1000);
  expect(g.tileH).toBe(1000);
  expect(g.crop).toEqual({ x: 0, y: 0, w: 3000, h: 1000 });
  const h = planGrid(4000, 1000, 3, 1, 'square');
  expect(h.crop).toEqual({ x: 500, y: 0, w: 3000, h: 1000 });
});

test('Instagram 4:5 tiles for a 3 by 2 grid', () => {
  const g = planGrid(3000, 3000, 3, 2, 'portrait');
  // Whole grid is 3*4 : 2*5 = 1.2, so 3000 wide by 2500 high.
  expect(g.tileW).toBe(1000);
  expect(g.tileH).toBe(1250);
  expect(g.crop.y).toBe(250);
  expect(g.tileW / g.tileH).toBeCloseTo(0.8, 3);
});
