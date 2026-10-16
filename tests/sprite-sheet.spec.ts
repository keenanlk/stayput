import { test, expect } from '@playwright/test';
import { MAX_SIDE, SheetTooLarge, BadGrid, defaultColumns, keptCount, layoutSheet, sheetJson, sliceSheet, trimTrailingEmpty } from '../src/lib/sprite-sheet';

test('a near-square grid is picked by default', () => {
  expect(defaultColumns(12, 32, 32)).toBe(4);
  expect(defaultColumns(24, 128, 128)).toBe(5);
  expect(defaultColumns(1, 10, 10)).toBe(1);
  // Wide frames stack in fewer columns to keep the sheet close to square.
  expect(defaultColumns(16, 200, 50)).toBe(2);
});

test('the JSON lists every frame’s x, y, w, h and delay', () => {
  const layout = layoutSheet(5, 20, 10, { columns: 3, padding: 2 });
  expect(layout).toMatchObject({ columns: 3, rows: 2, width: 3 * 20 + 4 * 2, height: 2 * 10 + 3 * 2, padding: 2 });
  const json = JSON.parse(sheetJson('walk.png', layout, [40, 50, 60, 70, 80]));
  expect(json).toMatchObject({ image: 'walk.png', width: 68, height: 26, columns: 3, rows: 2, padding: 2 });
  expect(json.frames).toEqual([
    { x: 2, y: 2, w: 20, h: 10, delay: 40 },
    { x: 24, y: 2, w: 20, h: 10, delay: 50 },
    { x: 46, y: 2, w: 20, h: 10, delay: 60 },
    { x: 2, y: 14, w: 20, h: 10, delay: 70 },
    { x: 24, y: 14, w: 20, h: 10, delay: 80 },
  ]);
});

test('no padding puts cells edge to edge, and padding is capped at 16', () => {
  const a = layoutSheet(4, 8, 8, { columns: 2 });
  expect(a.cells.map((c) => [c.x, c.y])).toEqual([[0, 0], [8, 0], [0, 8], [8, 8]]);
  expect(layoutSheet(1, 8, 8, { padding: 99 }).padding).toBe(16);
});

test('a sheet over 8,192 px or the pixel limit is refused with the numbers and what to change', () => {
  expect(() => layoutSheet(20, 512, 512, { columns: 20 })).toThrow(SheetTooLarge);
  try {
    layoutSheet(200, 512, 512);
  } catch (e) {
    expect(e).toBeInstanceOf(SheetTooLarge);
    expect((e as Error).name).toBe('SheetTooLarge');
    expect((e as Error).message).toContain('200 frames of 512 × 512');
    expect((e as Error).message).toContain('Nothing was drawn');
  }
  expect(() => layoutSheet(64, 512, 512, { columns: 8 })).not.toThrow();
  expect(() => layoutSheet(1, MAX_SIDE, MAX_SIDE, { maxPixels: 2 ** 24 })).toThrow(SheetTooLarge);
});

test('cutting a sheet gives back the cells the maker wrote', () => {
  const made = layoutSheet(12, 24, 16, { padding: 3 });
  const cut = sliceSheet(made.width, made.height, { columns: made.columns, rows: made.rows }, 3);
  expect(cut.cells).toEqual(made.cells);
  const bySize = sliceSheet(made.width, made.height, { cellW: 24, cellH: 16 }, 3);
  expect(bySize.cells).toEqual(made.cells);
});

test('a bad grid is a named failure', () => {
  expect(() => sliceSheet(100, 100, { columns: 0, rows: 2 })).toThrow(BadGrid);
  expect(() => sliceSheet(10, 10, { columns: 20, rows: 1 })).toThrow(BadGrid);
  expect(() => sliceSheet(100, 100, { cellW: 0, cellH: 4 })).toThrow(BadGrid);
});

test('frame step and trailing empty cells', () => {
  expect(keptCount(10, 3)).toBe(4);
  expect(keptCount(12, 1)).toBe(12);
  expect(trimTrailingEmpty([false, false, true, false, true, true])).toBe(4);
  expect(trimTrailingEmpty([true, true])).toBe(1);
});
