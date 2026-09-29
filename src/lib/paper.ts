/**
 * Paper sizes and the page layout for Resize PDF, kept apart from the PDF
 * code so they can be tested on their own.
 */

export type PaperSize = 'a4' | 'letter' | 'legal' | 'a3' | 'a5' | 'tabloid';
export type Orientation = 'auto' | 'portrait' | 'landscape';

/** Portrait width and height in points (1/72 inch). */
export const PAPER: Record<PaperSize, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
  tabloid: [792, 1224],
};

export interface ResizeOptions {
  size: PaperSize;
  orientation: Orientation;
  /** Blank margin on every side, in points. */
  margin: number;
}

export interface PagePlan {
  /** New page size before the page's own rotation, in points. */
  width: number;
  height: number;
  /** Scale and offset applied to the old content. */
  scale: number;
  dx: number;
  dy: number;
}

/**
 * Where the old page's visible box goes on the new paper. `rotation` is the
 * page's /Rotate; the paper is chosen for the page as it is displayed.
 */
export function planPage(box: { x: number; y: number; width: number; height: number }, rotation: number, opts: ResizeOptions): PagePlan {
  const turned = rotation === 90 || rotation === 270;
  const [shownW, shownH] = turned ? [box.height, box.width] : [box.width, box.height];
  let [pw, ph] = PAPER[opts.size];
  const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && shownW > shownH);
  if (landscape) [pw, ph] = [ph, pw];
  // Back into the page's unrotated space.
  const [width, height] = turned ? [ph, pw] : [pw, ph];
  const m = Math.max(0, Math.min(opts.margin, width / 4, height / 4));
  const scale = Math.min((width - 2 * m) / box.width, (height - 2 * m) / box.height);
  return {
    width,
    height,
    scale,
    dx: (width - box.width * scale) / 2 - box.x * scale,
    dy: (height - box.height * scale) / 2 - box.y * scale,
  };
}
