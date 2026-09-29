/**
 * Layout for a GIF made from pictures. Every frame has the size of the first
 * picture scaled to the chosen width; each picture is either shown whole on
 * a plain background ('contain') or scaled to fill the frame with its
 * overflow cropped ('cover').
 */

export type GifFit = 'contain' | 'cover';

export interface Placement {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Frame size: the first picture's shape at `width` (never enlarged past it), both sides even. */
export function frameSize(first: { width: number; height: number }, width: number): { width: number; height: number } {
  const w = Math.max(2, Math.min(width, first.width));
  const h = Math.max(2, Math.round((w * first.height) / first.width));
  return { width: w - (w % 2), height: h - (h % 2) };
}

export function place(srcW: number, srcH: number, frameW: number, frameH: number, fit: GifFit): Placement {
  if (fit === 'cover') {
    const k = Math.max(frameW / srcW, frameH / srcH);
    const sw = frameW / k;
    const sh = frameH / k;
    return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh, dx: 0, dy: 0, dw: frameW, dh: frameH };
  }
  const k = Math.min(frameW / srcW, frameH / srcH);
  const dw = srcW * k;
  const dh = srcH * k;
  return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: (frameW - dw) / 2, dy: (frameH - dh) / 2, dw, dh };
}

/**
 * Order the frames play in. With `bounce`, the sequence runs forward and then
 * back, without repeating the two end frames: 0 1 2 3 2 1.
 */
export function playOrder(count: number, bounce: boolean): number[] {
  const forward = Array.from({ length: count }, (_, i) => i);
  if (!bounce || count < 3) return forward;
  return [...forward, ...forward.slice(1, -1).reverse()];
}
