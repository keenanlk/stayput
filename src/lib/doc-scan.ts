/**
 * Turn a phone photo of a sheet of paper into a flat scan: find the page's
 * four corners, undo the perspective so the page becomes a rectangle, and
 * even out the lighting so the paper is white and shadows disappear. Pure
 * array code, so it runs the same in a test as in the tab.
 */

export type Point = [number, number];
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

/** Otsu's threshold for 8-bit values: the split that best separates dark from light. */
export function otsu(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]!++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

const area = (q: Point[]) => {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const [x0, y0] = q[i]!;
    const [x1, y1] = q[(i + 1) % q.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
};

/**
 * The page in a small grayscale image (a few hundred pixels across): the
 * largest bright region, which must fill most of its own four-corner outline
 * and a fair share of the photo. Undefined when there is no clear page, such
 * as paper on a white desk or a photo taken from too far away.
 */
export function findPage(gray: Uint8Array, w: number, h: number): Quad | undefined {
  // A 3×3 box blur keeps text and paper texture from splitting the page.
  const soft = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += gray[yy * w + xx]!;
          n++;
        }
      }
      soft[y * w + x] = s / n;
    }
  }
  const t = otsu(soft);
  // Largest 4-connected bright region.
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  let bestId = -1;
  let bestSize = 0;
  let id = 0;
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || soft[start]! <= t) continue;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    let size = 0;
    while (top) {
      const p = stack[--top]!;
      size++;
      const x = p % w;
      const y = (p - x) / w;
      const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of next) {
        if (q >= 0 && label[q] === -1 && soft[q]! > t) {
          label[q] = id;
          stack[top++] = q;
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestId = id;
    }
    id++;
  }
  if (bestId < 0 || bestSize < w * h * 0.15) return undefined;
  // Corners are the region's extremes along the two diagonals.
  let tl: Point = [0, 0], tr: Point = [0, 0], br: Point = [0, 0], bl: Point = [0, 0];
  let minSum = Infinity, maxSum = -Infinity, maxDiff = -Infinity, minDiff = Infinity;
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== bestId) continue;
    const x = p % w;
    const y = (p - x) / w;
    const s = x + y;
    const d = x - y;
    if (s < minSum) (minSum = s), (tl = [x, y]);
    if (s > maxSum) (maxSum = s), (br = [x + 1, y + 1]);
    if (d > maxDiff) (maxDiff = d), (tr = [x + 1, y]);
    if (d < minDiff) (minDiff = d), (bl = [x, y + 1]);
  }
  const quad: Quad = [tl, tr, br, bl];
  const a = area(quad);
  // A page fills its outline; a lamp, a window or a cluttered desk does not.
  if (a < w * h * 0.15 || bestSize / a < 0.85 || bestSize / a > 1.15) return undefined;
  // It is also convex, with no corner folded over another.
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = quad[i]!;
    const [bx, by] = quad[(i + 1) % 4]!;
    const [cx, cy] = quad[(i + 2) % 4]!;
    if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) <= 0) return undefined;
  }
  return quad;
}

/** Solve A·x = b for a small dense system by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[pivot]![c]!)) pivot = r;
    [M[c], M[pivot]] = [M[pivot]!, M[c]!];
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) throw new Error('The page corners are in a line.');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** The 3×3 homography (row-major, last entry 1) taking each `from` point to the matching `to` point. */
export function homography(from: Quad, to: Quad): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i]!;
    const [u, v] = to[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(A, b), 1];
}

export function project(H: number[], x: number, y: number): Point {
  const z = H[6]! * x + H[7]! * y + H[8]!;
  return [(H[0]! * x + H[1]! * y + H[2]!) / z, (H[3]! * x + H[4]! * y + H[5]!) / z];
}

/** Width and height of the flattened page: the average of opposite sides, capped to `maxSide`. */
export function flatSize(q: Quad, maxSide: number): { width: number; height: number } {
  const len = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  let width = (len(q[0], q[1]) + len(q[3], q[2])) / 2;
  let height = (len(q[0], q[3]) + len(q[1], q[2])) / 2;
  const s = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * s));
  height = Math.max(1, Math.round(height * s));
  return { width, height };
}

/** Straighten the page: every output pixel looks up where it lies in the photo (bilinear). */
export function warp(src: Uint8ClampedArray, sw: number, sh: number, quad: Quad, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const H = homography([[0, 0], [width, 0], [width, height], [0, height]], quad);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [fx, fy] = project(H, x + 0.5, y + 0.5);
      const sx = Math.min(sw - 1.001, Math.max(0, fx - 0.5));
      const sy = Math.min(sh - 1.001, Math.max(0, fy - 0.5));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const ax = sx - x0;
      const ay = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c]! * (1 - ax) + src[i10 + c]! * ax;
        const bottom = src[i01 + c]! * (1 - ax) + src[i11 + c]! * ax;
        out[o + c] = top * (1 - ay) + bottom * ay;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

export type Look = 'color' | 'gray' | 'bw' | 'original';

/**
 * Even out the light: estimate the paper's own brightness everywhere (the
 * brightest values in coarse blocks, smoothed) and divide by it, so a shadow
 * or a lamp's falloff turns white like the rest of the sheet. Ink stays dark.
 */
export function enhance(px: Uint8ClampedArray, w: number, h: number, look: Look): void {
  if (look === 'original') return;
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!;
  const bg = paper(lum, w, h);
  for (let i = 0; i < n; i++) {
    const white = Math.max(bg[i]!, 1);
    if (look === 'color') {
      for (let c = 0; c < 3; c++) px[i * 4 + c] = stretch(px[i * 4 + c]! / white);
    } else {
      const v = lum[i]! / white;
      const g = look === 'bw' ? (v < 0.72 ? 0 : 255) : stretch(v);
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g;
    }
  }
}

/** After dividing by the paper, 0.92 and up is paper and becomes pure white; ink is darkened a touch. */
const stretch = (v: number) => Math.round(255 * Math.min(1, Math.max(0, (v - 0.12) / 0.8)));

/** The paper's brightness at every pixel, from the 90th percentile of blocks about 1/24 of the page. */
function paper(lum: Float32Array, w: number, h: number): Float32Array {
  const block = Math.max(8, Math.round(Math.max(w, h) / 24));
  const bw = Math.ceil(w / block);
  const bh = Math.ceil(h / block);
  const grid = new Float32Array(bw * bh);
  const values: number[] = [];
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      values.length = 0;
      for (let y = by * block; y < Math.min(h, (by + 1) * block); y += 2) {
        for (let x = bx * block; x < Math.min(w, (bx + 1) * block); x += 2) values.push(lum[y * w + x]!);
      }
      values.sort((a, b) => a - b);
      grid[by * bw + bx] = values[Math.floor(values.length * 0.9)] ?? 255;
    }
  }
  // A block that is mostly ink (a photo, a heading) would read as dark paper; take the brightest neighbour in reach.
  const lifted = new Float32Array(grid.length);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = bx + dx;
          const y = by + dy;
          if (x >= 0 && y >= 0 && x < bw && y < bh) m = Math.max(m, grid[y * bw + x]!);
        }
      }
      lifted[by * bw + bx] = m;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(bh - 1, Math.max(0, (y + 0.5) / block - 0.5));
    const y0 = Math.floor(gy);
    const y1 = Math.min(bh - 1, y0 + 1);
    const ay = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = Math.min(bw - 1, Math.max(0, (x + 0.5) / block - 0.5));
      const x0 = Math.floor(gx);
      const x1 = Math.min(bw - 1, x0 + 1);
      const ax = gx - x0;
      const top = lifted[y0 * bw + x0]! * (1 - ax) + lifted[y0 * bw + x1]! * ax;
      const bottom = lifted[y1 * bw + x0]! * (1 - ax) + lifted[y1 * bw + x1]! * ax;
      out[y * w + x] = top * (1 - ay) + bottom * ay;
    }
  }
  return out;
}

/** Pull each corner a fraction of the way toward the middle, so no sliver of the table shows along the edges. */
export function inset(q: Quad, f: number): Quad {
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  return q.map(([x, y]) => [x + (cx - x) * f, y + (cy - y) * f]) as Quad;
}
