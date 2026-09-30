import { test, expect } from '@playwright/test';
import { placeWords, winAnsi } from '../src/lib/ocr-layer';

const word = (text: string, x0: number, y0: number, x1: number, y1: number) => ({ text, x0, y0, x1, y1, lineHeight: y1 - y0 });

test('placeWords maps pixel boxes to PDF points on an upright page and stretches words to their width', () => {
  // A 612×792 pt page rendered at 2 px per point, y flipped as PDF does.
  const toPdf = (x: number, y: number): [number, number] => [x / 2, 792 - y / 2];
  const widthOf = (t: string, size: number) => t.length * size * 0.5;
  const [p] = placeWords([word('Invoice', 200, 100, 400, 140)], toPdf, widthOf);
  expect(p!.matrix[0]).toBeCloseTo(1);
  expect(p!.matrix[1]).toBeCloseTo(0);
  expect(p!.matrix[4]).toBeCloseTo(100);
  // Baseline 15% of the line height above the bottom of the box: 140 - 6 = 134 px → 792 - 67 pt.
  expect(p!.matrix[5]).toBeCloseTo(725);
  expect(p!.size).toBeCloseTo(20 * 0.85);
  // 100 pt wide on the scan; the font would draw it 7 × 8.5 = 59.5 pt wide.
  expect(p!.scale).toBeCloseTo((100 / 59.5) * 100, 3);
});

test('placeWords follows a page turned 90° by /Rotate', () => {
  // Rendered landscape; PDF x runs down the image and PDF y runs along it.
  const toPdf = (x: number, y: number): [number, number] => [y, x];
  const [p] = placeWords([word('Total', 10, 20, 60, 30)], toPdf, (t, s) => t.length * s * 0.5);
  // Along the baseline (image x) is PDF +y.
  expect(p!.matrix[0]).toBeCloseTo(0);
  expect(p!.matrix[1]).toBeCloseTo(1);
});

test('placeWords puts the words of a line on its baseline and follows its slope', () => {
  const toPdf = (x: number, y: number): [number, number] => [x, 1000 - y];
  const widthOf = (t: string, s: number) => t.length * s * 0.5;
  const [a, b] = placeWords(
    [
      { ...word('quick', 0, 0, 100, 40), baseline: [30, 31] },
      { ...word('the', 120, 0, 180, 32), baseline: [31.2, 32] },
    ],
    toPdf,
    widthOf,
  );
  expect(a!.matrix[5]).toBeCloseTo(970);
  expect(b!.matrix[5]).toBeCloseTo(968.8);
  // A 1 px rise over 100 px turns the text by about 0.57°.
  expect(Math.atan2(a!.matrix[1], a!.matrix[0]) * (180 / Math.PI)).toBeCloseTo(-0.573, 2);
});

test('winAnsi keeps Latin text and swaps typographic marks', () => {
  expect(winAnsi('“Café” – ﬁnal’s €5')).toBe('"Café" - final\'s €5');
  expect(winAnsi('日本')).toBe('');
});
