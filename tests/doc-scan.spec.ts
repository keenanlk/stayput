import { test, expect } from '@playwright/test';
import { enhance, findPage, flatSize, homography, project, warp, type Quad } from '../src/lib/doc-scan';

/** Is (x, y) inside the convex quad (clockwise in image coordinates)? */
function inside(q: Quad, x: number, y: number): boolean {
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i]!;
    const [bx, by] = q[(i + 1) % 4]!;
    if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0) return false;
  }
  return true;
}

/** A 400×300 photo: a dark desk with a tilted sheet of paper and a few lines of "text". */
function photo(page: Quad): Uint8Array {
  const w = 400;
  const h = 300;
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 60 + ((x * 7 + y * 13) % 20);
      if (inside(page, x, y)) v = 225 + ((x + y) % 10);
      g[y * w + x] = v;
    }
  }
  return g;
}

test('findPage finds the corners of a tilted sheet on a dark desk', () => {
  const page: Quad = [[80, 40], [330, 60], [310, 270], [60, 250]];
  const q = findPage(photo(page), 400, 300)!;
  expect(q).toBeDefined();
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(q[i]![0] - page[i]![0])).toBeLessThanOrEqual(3);
    expect(Math.abs(q[i]![1] - page[i]![1])).toBeLessThanOrEqual(3);
  }
});

test('findPage gives up on a photo with no page in it', () => {
  const g = new Uint8Array(400 * 300);
  for (let i = 0; i < g.length; i++) g[i] = (i * 37) % 256;
  expect(findPage(g, 400, 300)).toBeUndefined();
  // A small card far away is not a page.
  expect(findPage(photo([[180, 130], [220, 130], [220, 160], [180, 160]]), 400, 300)).toBeUndefined();
});

test('homography maps the corners exactly and warp straightens the page', () => {
  const quad: Quad = [[10, 5], [90, 12], [85, 70], [5, 60]];
  const rect: Quad = [[0, 0], [100, 0], [100, 80], [0, 80]];
  const H = homography(rect, quad);
  for (let i = 0; i < 4; i++) {
    const [x, y] = project(H, rect[i]![0], rect[i]![1]);
    expect(x).toBeCloseTo(quad[i]![0], 6);
    expect(y).toBeCloseTo(quad[i]![1], 6);
  }
  expect(flatSize(quad, 1000)).toEqual({ width: 80, height: 57 });
  expect(flatSize(quad, 40)).toEqual({ width: 40, height: 28 });
  // A white quad on black comes out all white once straightened.
  const sw = 100;
  const sh = 80;
  const src = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const v = inside(quad, x + 0.5, y + 0.5) ? 255 : 0;
    src.set([v, v, v, 255], (y * sw + x) * 4);
  }
  const { width, height } = flatSize(quad, 1000);
  const out = warp(src, sw, sh, quad, width, height);
  let dark = 0;
  for (let i = 0; i < width * height; i++) if (out[i * 4]! < 128) dark++;
  // Only the outermost ring of pixels may touch the desk.
  expect(dark / (width * height)).toBeLessThan(0.05);
});

test('enhance whitens a shadowed page and keeps the ink dark', () => {
  const w = 240;
  const h = 240;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Paper fades from 230 on the left to 120 in a shadow on the right; ink is 40% of the paper.
      const paper = 230 - (110 * x) / w;
      const ink = y % 40 < 4 && x % 30 < 20;
      const v = ink ? paper * 0.4 : paper;
      px.set([v, v, v * 0.95, 255], (y * w + x) * 4);
    }
  }
  const copy = px.slice();
  enhance(px, w, h, 'gray');
  const at = (x: number, y: number) => px[(y * w + x) * 4]!;
  expect(at(10, 20)).toBeGreaterThan(245);
  expect(at(230, 20)).toBeGreaterThan(245);
  expect(at(10, 1)).toBeLessThan(100);
  expect(at(220, 1)).toBeLessThan(100);
  enhance(copy, w, h, 'bw');
  const bw = (x: number, y: number) => copy[(y * w + x) * 4]!;
  expect([bw(10, 20), bw(230, 20), bw(10, 1), bw(220, 1)]).toEqual([255, 255, 0, 0]);
});
