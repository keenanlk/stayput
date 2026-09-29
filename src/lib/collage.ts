/**
 * Where each picture goes in a collage. Pictures in a row share a height,
 * pictures in a column share a width, and a grid gives every picture a cell
 * of the same size, either filled (cropped to the cell) or fitted whole.
 * Pure arithmetic, so it runs the same for the preview and the full-size file.
 */

export type Layout = 'row' | 'column' | 'grid';
export type Fit = 'fill' | 'fit';

export interface Size { width: number; height: number }

export interface Cell {
  /** Source rectangle in the picture. */
  sx: number; sy: number; sw: number; sh: number;
  /** Destination rectangle in the collage. */
  dx: number; dy: number; dw: number; dh: number;
}

export interface CollagePlan { width: number; height: number; cells: Cell[] }

export interface CollageOptions {
  layout: Layout;
  /** Columns for a grid; 0 picks a near-square grid. */
  columns: number;
  fit: Fit;
  /** Space between and around pictures, as a share of the shared side (0 to 0.1). */
  gap: number;
  /** Longest side of the collage in pixels. */
  maxSide: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

function place(src: Size, dx: number, dy: number, dw: number, dh: number, fit: Fit): Cell {
  const full = { sx: 0, sy: 0, sw: src.width, sh: src.height };
  if (fit === 'fill') {
    // Crop the middle of the picture to the cell's shape.
    const want = dw / dh;
    const have = src.width / src.height;
    if (have > want) {
      const sw = src.height * want;
      return { sx: (src.width - sw) / 2, sy: 0, sw, sh: src.height, dx, dy, dw, dh };
    }
    const sh = src.width / want;
    return { sx: 0, sy: (src.height - sh) / 2, sw: src.width, sh, dx, dy, dw, dh };
  }
  const k = Math.min(dw / src.width, dh / src.height);
  const w = src.width * k;
  const h = src.height * k;
  return { ...full, dx: dx + (dw - w) / 2, dy: dy + (dh - h) / 2, dw: w, dh: h };
}

export function planCollage(sizes: Size[], o: CollageOptions): CollagePlan {
  if (!sizes.length) return { width: 1, height: 1, cells: [] };
  const n = sizes.length;
  if (o.layout === 'row' || o.layout === 'column') {
    const row = o.layout === 'row';
    // The shared side: the median picture's, then everything scaled to fit maxSide.
    let side = median(sizes.map((s) => (row ? s.height : s.width)));
    const lengths = (sd: number) => sizes.map((s) => (row ? (s.width * sd) / s.height : (s.height * sd) / s.width));
    const total = (sd: number) => lengths(sd).reduce((a, b) => a + b, 0) + o.gap * sd * (n + 1);
    const long = Math.max(total(side), side * (1 + 2 * o.gap));
    if (long > o.maxSide) side *= o.maxSide / long;
    side = Math.max(1, Math.round(side));
    const g = Math.round(o.gap * side);
    const ls = lengths(side).map((l) => Math.max(1, Math.round(l)));
    const cells: Cell[] = [];
    let at = g;
    ls.forEach((l, i) => {
      cells.push(row ? place(sizes[i]!, at, g, l, side, 'fill') : place(sizes[i]!, g, at, side, l, 'fill'));
      at += l + g;
    });
    return row ? { width: at, height: side + 2 * g, cells } : { width: side + 2 * g, height: at, cells };
  }
  const cols = Math.max(1, Math.min(n, o.columns || Math.ceil(Math.sqrt(n))));
  const rows = Math.ceil(n / cols);
  // Cells take the median picture's shape and width.
  const aspect = median(sizes.map((s) => s.width / s.height));
  let cw = median(sizes.map((s) => s.width));
  let ch = cw / aspect;
  const W = (w: number) => cols * w + (cols + 1) * o.gap * w;
  const H = (h: number, w: number) => rows * h + (rows + 1) * o.gap * w;
  const k = Math.min(1, o.maxSide / Math.max(W(cw), H(ch, cw)));
  cw = Math.max(1, Math.round(cw * k));
  ch = Math.max(1, Math.round(ch * k));
  const g = Math.round(o.gap * cw);
  const cells = sizes.map((s, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // Centre a short last row.
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const offset = ((cols - inRow) * (cw + g)) / 2;
    return place(s, g + offset + c * (cw + g), g + r * (ch + g), cw, ch, o.fit);
  });
  return { width: cols * cw + (cols + 1) * g, height: rows * ch + (rows + 1) * g, cells };
}
