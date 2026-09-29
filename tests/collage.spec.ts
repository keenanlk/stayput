import { expect, test } from '@playwright/test';
import { planCollage, type CollageOptions } from '../src/lib/collage';

/** How Collage maker lays pictures out. */

const base: CollageOptions = { layout: 'row', columns: 0, fit: 'fill', gap: 0, maxSide: 10000 };

test('side by side, pictures share a height and keep their shape', () => {
  const p = planCollage([{ width: 400, height: 300 }, { width: 300, height: 600 }, { width: 800, height: 600 }], base);
  expect(p.height).toBe(600);
  expect(p.cells.map((c) => c.dw)).toEqual([800, 300, 800]);
  expect(p.width).toBe(1900);
  expect(p.cells[1]).toMatchObject({ dx: 800, dy: 0, sw: 300, sh: 600 });
});

test('stacked, pictures share a width, with gaps around them', () => {
  const p = planCollage([{ width: 1000, height: 500 }, { width: 500, height: 500 }], { ...base, layout: 'column', gap: 0.02 });
  // Median width of two is the larger (1000); gap is 20 px.
  expect(p.width).toBe(1040);
  expect(p.cells[0]).toMatchObject({ dx: 20, dy: 20, dw: 1000, dh: 500 });
  expect(p.cells[1]).toMatchObject({ dx: 20, dy: 540, dw: 1000, dh: 1000 });
  expect(p.height).toBe(1560);
});

test('the collage is scaled down to the longest side allowed', () => {
  const p = planCollage([{ width: 4000, height: 3000 }, { width: 4000, height: 3000 }], { ...base, maxSide: 2000 });
  expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(2000);
  expect(p.cells[0]!.dh).toBe(750);
});

test('a grid of five centres the short last row, and Fit keeps whole pictures', () => {
  const sizes = Array.from({ length: 5 }, () => ({ width: 600, height: 400 }));
  sizes[4] = { width: 400, height: 400 };
  const p = planCollage(sizes, { ...base, layout: 'grid', fit: 'fit' });
  // 3 columns, 2 rows of 600 x 400 cells.
  expect(p.width).toBe(1800);
  expect(p.height).toBe(800);
  // The fourth and fifth pictures sit in the middle of the second row.
  expect(p.cells[3]!.dx).toBe(300);
  // The square one is fitted whole into its 600 x 400 cell.
  expect(p.cells[4]).toMatchObject({ sw: 400, sh: 400, dw: 400, dh: 400, dx: 1000, dy: 400 });
});

test('Fill crops a picture to the cell shape from the middle', () => {
  const p = planCollage([{ width: 600, height: 400 }, { width: 600, height: 400 }, { width: 400, height: 400 }], { ...base, layout: 'grid', columns: 3 });
  expect(p.cells[2]).toMatchObject({ sw: 400, sy: 400 / 2 - (400 / 1.5) / 2 });
});
