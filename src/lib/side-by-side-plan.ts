/**
 * Plain arithmetic for Side by side video: how big the output is, where each clip
 * sits in it, how long it runs, and how much memory the run needs. No browser APIs
 * and no imports, so the specs can test it directly.
 */

export type SbsLayout = 'row' | 'column';
export type SbsFit = 'contain' | 'cover';
export type SbsSound = 'a' | 'b' | 'mix' | 'none';
export type SbsLength = 'shorter' | 'longer';

/** The widest (and tallest) picture written. */
export const MAX_SIDE = 3840;
/** Frames per second the output never exceeds. */
export const MAX_FPS = 60;
/** Memory a run may need on a computer, in bytes (a tab can hold more, but not safely). */
export const DESKTOP_MEMORY_CAP = 2_500_000_000;
/** Memory a run may need on a phone, in bytes. */
export const PHONE_MEMORY_CAP = 700_000_000;

export const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Plan {
  width: number;
  height: number;
  a: Cell;
  b: Cell;
}

/**
 * Two clips' display sizes in, the output picture out. With "contain" the clips share a
 * height (row) or a width (column) and keep their own shapes, so nothing is cropped; with
 * "cover" both cells are A's size and B is cropped to fill its cell. Every cell is even, and
 * the whole is scaled down together when it would pass MAX_SIDE.
 */
export function planSideBySide(aw: number, ah: number, bw: number, bh: number, layout: SbsLayout, fit: SbsFit): Plan {
  let cellA: { w: number; h: number };
  let cellB: { w: number; h: number };
  if (fit === 'cover') {
    cellA = cellB = { w: aw, h: ah };
  } else if (layout === 'row') {
    cellA = { w: aw, h: ah };
    cellB = { w: (bw * ah) / bh, h: ah };
  } else {
    cellA = { w: aw, h: ah };
    cellB = { w: aw, h: (bh * aw) / bw };
  }
  const totalW = layout === 'row' ? cellA.w + cellB.w : Math.max(cellA.w, cellB.w);
  const totalH = layout === 'row' ? Math.max(cellA.h, cellB.h) : cellA.h + cellB.h;
  const k = Math.min(1, MAX_SIDE / totalW, MAX_SIDE / totalH);
  const A = { w: even(cellA.w * k), h: even(cellA.h * k) };
  const B = { w: even(cellB.w * k), h: even(cellB.h * k) };
  if (layout === 'row') {
    const h = Math.max(A.h, B.h);
    return { width: A.w + B.w, height: h, a: { x: 0, y: 0, ...A }, b: { x: A.w, y: 0, ...B } };
  }
  const w = Math.max(A.w, B.w);
  return { width: w, height: A.h + B.h, a: { x: 0, y: 0, ...A }, b: { x: 0, y: A.h, ...B } };
}

/**
 * The same plan with every cell scaled by `k` (at most 1), each side kept even. A retry after the encoder gave up uses it to keep the
 * output's longest side within a cap: planning the clips again at a smaller size would not, because the plan already scales a wide pair down.
 */
export function scalePlan(p: Plan, k: number): Plan {
  if (k >= 1) return p;
  // Rounded down to even, so two cells side by side never add up to more than the cap.
  const down = (n: number) => Math.max(2, 2 * Math.floor((n * k) / 2));
  const A = { w: down(p.a.w), h: down(p.a.h) };
  const B = { w: down(p.b.w), h: down(p.b.h) };
  if (p.b.x > 0) return { width: A.w + B.w, height: Math.max(A.h, B.h), a: { x: 0, y: 0, ...A }, b: { x: A.w, y: 0, ...B } };
  return { width: Math.max(A.w, B.w), height: A.h + B.h, a: { x: 0, y: 0, ...A }, b: { x: 0, y: A.h, ...B } };
}

/** The output rate: the faster clip's, rounded, at most MAX_FPS. A clip whose rate is unknown counts as 30. */
export function outputFps(a: number, b: number): number {
  const rate = (r: number) => (Number.isFinite(r) && r > 0 ? r : 30);
  return Math.max(1, Math.min(MAX_FPS, Math.round(Math.max(rate(a), rate(b)))));
}

/** How long the output runs: the shorter clip's picture, or the longer one's with the shorter frozen on its last frame. */
export function outputSeconds(a: number, b: number, length: SbsLength): number {
  return length === 'longer' ? Math.max(a, b) : Math.min(a, b);
}

/**
 * What a run holds in memory, in bytes: the finished MP4 (kept whole until it is saved),
 * a few decoded frames of each clip, the output canvases, and the sound as 32-bit floats
 * (each clip read whole, plus the mix).
 */
export function estimateMemory(p: { width: number; height: number; a: Cell; b: Cell; fps: number; seconds: number; sound: SbsSound; soundSeconds: number }): number {
  const output = p.width * p.height * p.fps * p.seconds * 0.012;
  const frames = (p.a.w * p.a.h + p.b.w * p.b.h) * 4 * 12 + p.width * p.height * 4 * 3;
  const sound = p.sound === 'none' ? 0 : p.soundSeconds * 48_000 * 2 * 4 * (p.sound === 'mix' ? 3 : 2);
  return Math.round(output + frames + sound + 60_000_000);
}

/** The reason a run is refused before any encoding, or '' when it may go ahead. */
export function memoryVerdict(estimate: number, phone: boolean, mb: (n: number) => string): string {
  const cap = phone ? PHONE_MEMORY_CAP : DESKTOP_MEMORY_CAP;
  if (estimate <= cap) return '';
  return `This job needs about ${mb(estimate)} of memory and ${phone ? 'a phone' : 'this device'} can safely give about ${mb(cap)}. Trim the clips shorter first, or ${phone ? 'use a computer' : 'use smaller clips'}.`;
}
