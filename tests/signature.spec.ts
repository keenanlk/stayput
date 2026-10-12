import { test, expect } from '@playwright/test';
import { firstOutsideLatin, hasTransparency, inkAlpha, inkShare, outputSize, strokeBounds, strokePath, strokesToSvg, trimAlpha, trimRect, type Stroke } from '../src/lib/signature';

// Pure maths of the signature maker (src/lib/signature.ts): no browser, no DOM.

const line: Stroke = { pts: [[10, 10], [110, 60]], w: 5 };

test('bounds are the points grown by half the widest pen, and the margin is 4% of the width, at least 8', () => {
  expect(strokeBounds([line])).toEqual({ minX: 7.5, minY: 7.5, maxX: 112.5, maxY: 62.5 });
  // 105 wide: 4% is 4.2, so the 8 px minimum applies.
  expect(trimRect([line])).toEqual({ x: -0.5, y: -0.5, w: 121, h: 71 });
  // 1000 wide: 4% is 40.
  const wide: Stroke = { pts: [[0, 0], [1000, 100]], w: 2 };
  const r = trimRect([wide]);
  expect(r.x).toBeCloseTo(-1 - 40.08, 1);
  expect(r.w).toBeCloseTo(1002 + 2 * 40.08, 1);
  expect(strokeBounds([])).toBeUndefined();
  expect(trimRect([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
});

test('a stroke becomes one path: curves when smoothed, lines when not, a dot for a tap', () => {
  const s: Stroke = { pts: [[0, 0], [10, 20], [20, 0]], w: 4 };
  const smooth = strokePath(s, true);
  expect(smooth.startsWith('M0 0')).toBe(true);
  expect(smooth).toContain('Q');
  expect(smooth.endsWith('L20 0')).toBe(true);
  const straight = strokePath(s, false);
  expect(straight).toBe('M0 0L10 20L20 0');
  expect(straight).not.toContain('Q');
  expect(strokePath({ pts: [[5.5, 6]], w: 4 }, true)).toBe('M5.5 6h0.01');
  expect(strokePath({ pts: [], w: 4 }, true)).toBe('');
});

test('the SVG has one path per stroke, the ink as stroke, the trimmed rectangle as viewBox and no fill, text or image', () => {
  const svg = strokesToSvg([line, { pts: [[30, 30]], w: 5 }], '#1a3f8f', true);
  expect(svg.match(/<path /g)).toHaveLength(2);
  expect(svg).toContain('fill="none"');
  expect(svg).toContain('stroke="#1a3f8f"');
  expect(svg).toContain('stroke-linecap="round"');
  const r = trimRect([line, { pts: [[30, 30]], w: 5 }]);
  expect(svg).toContain(`viewBox="${r.x} ${r.y} ${r.w} ${r.h}"`);
  for (const tag of ['<rect', '<text', '<image']) expect(svg).not.toContain(tag);
});

function barOn(w: number, h: number, paper: (x: number) => number, ink: number, barRows: [number, number]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = y >= barRows[0] && y < barRows[1] ? ink : paper(x);
      px.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return px;
}

test('inkAlpha keeps the ink and drops the paper, even under a gradient', () => {
  const w = 200;
  const h = 80;
  const flat = inkAlpha(barOn(w, h, () => 235, 0, [38, 41]), w, h, 50);
  expect(flat[39 * w + 100]).toBe(255);
  expect(flat[10 * w + 100]).toBe(0);
  expect(flat[50 * w + 100]).toBe(0);

  // Paper fading from 255 to 140 across the width: the far corners are still paper. The darkest edge can keep a
  // haze of a couple of levels (the running maximum reaches brighter paper beside it), well under the 8 that trimming ignores.
  const fade = inkAlpha(barOn(w, h, (x) => 255 - (115 * x) / (w - 1), 20, [38, 41]), w, h, 50);
  expect(fade[39 * w + 100]).toBe(255);
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [150, 10]] as const) expect(fade[y * w + x]).toBeLessThanOrEqual(8);
});

test('inkAlpha: all white has no ink, all black is nearly all ink, and strength raises pale ink', () => {
  const w = 120;
  const h = 60;
  const white = new Uint8ClampedArray(w * h * 4).fill(255);
  expect(Math.max(...inkAlpha(white, w, h))).toBeLessThanOrEqual(8);
  const black = new Uint8ClampedArray(w * h * 4);
  for (let i = 3; i < black.length; i += 4) black[i] = 255;
  expect(inkShare(inkAlpha(black, w, h)).share).toBeGreaterThan(0.9);

  const pale = barOn(w, h, () => 235, 150, [28, 31]);
  const low = inkAlpha(pale, w, h, 0)[29 * w + 60]!;
  const high = inkAlpha(pale, w, h, 100)[29 * w + 60]!;
  expect(high).toBeGreaterThan(low);
});

test('trimAlpha returns the ink box with a margin inside the image, and nothing for an empty plane', () => {
  const w = 100;
  const h = 60;
  const a = new Uint8ClampedArray(w * h);
  for (let y = 20; y <= 30; y++) for (let x = 40; x <= 60; x++) a[y * w + x] = 255;
  const r = trimAlpha(a, w, h);
  expect(r.x).toBeLessThanOrEqual(40);
  expect(r.y).toBeLessThanOrEqual(20);
  expect(r.x + r.w).toBeGreaterThanOrEqual(61);
  expect(r.y + r.h).toBeGreaterThanOrEqual(31);
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.x + r.w).toBeLessThanOrEqual(w);
  expect(r.w * r.h).toBeLessThan(w * h / 2);
  expect(trimAlpha(new Uint8ClampedArray(w * h), w, h)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
});

test('a photo is never saved wider than its own trimmed width; strokes are', () => {
  expect(outputSize(700, 1200, true)).toBe(700);
  expect(outputSize(700, 1200, false)).toBe(1200);
  expect(outputSize(2000, 1200, true)).toBe(1200);
});

test('transparency and letter checks', () => {
  expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false);
  expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 0]))).toBe(true);
  expect(firstOutsideLatin('José Muñoz Çelik')).toBeUndefined();
  expect(firstOutsideLatin('Łukasz')).toBe('Ł');
  expect(firstOutsideLatin('Ada 田')).toBe('田');
});
