import { test, expect } from '@playwright/test';
import { traceToSvg } from '../src/lib/trace';

/** A white square with a black disc in the middle and a red bar along the bottom. */
function picture(size = 100): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const disc = (x - size / 2) ** 2 + (y - size / 2.5) ** 2 < (size / 4) ** 2;
      const bar = y >= size * 0.8;
      const [r, g, b] = disc ? [0, 0, 0] : bar ? [220, 30, 30] : [255, 255, 255];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

test('traceToSvg turns flat artwork into filled paths at the scaled size', () => {
  const r = traceToSvg(picture(), { mode: 'logo', dropWhite: false, scale: 2 });
  expect(r.svg).toMatch(/^<svg /);
  expect(r.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(r.svg).toContain('width="200"');
  expect(r.svg).toContain('height="200"');
  expect(r.colours).toBe(3);
  expect(r.paths).toBeGreaterThanOrEqual(3);
  expect(r.svg).toMatch(/fill="rgb\(0,0,0\)"/);
});

test('traceToSvg leaves white out when asked, for a transparent background', () => {
  const r = traceToSvg(picture(), { mode: 'logo', dropWhite: true, scale: 1 });
  expect(r.colours).toBe(2);
  expect(r.svg).not.toMatch(/fill="rgb\(25[0-5],25[0-5],25[0-5]\)"/);
});

test('traceToSvg in black and white mode draws only black and white', () => {
  const src = picture();
  // Pre-thresholded as the tool does: the red bar becomes black.
  for (let i = 0; i < src.data.length; i += 4) if (src.data[i + 1]! < 128) src.data[i] = src.data[i + 1] = src.data[i + 2] = 0;
  const r = traceToSvg(src, { mode: 'bw', dropWhite: true, scale: 1 });
  expect(r.colours).toBe(1);
  const fills = new Set([...r.svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]));
  expect([...fills]).toEqual(['rgb(0,0,0)']);
});
