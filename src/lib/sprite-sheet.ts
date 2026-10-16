/**
 * Layout and slicing for the sprite sheet maker. Pure arithmetic with no browser or vendor imports,
 * so the unit tests can load it: where each frame sits on a sheet, what the JSON lists, and how a
 * sheet is cut back into frames.
 */

/** The longest side a sheet may have. */
export const MAX_SIDE = 8192;
/** Pixels a sheet may hold (RGBA is 4 bytes each); phones and tablets get half. */
export const MAX_PIXELS = 2 ** 25;
export const MAX_PIXELS_PHONE = 2 ** 24;
export const MAX_PADDING = 16;

/** A sheet that would be too big, with what to change. Its name is what a failed run records. */
export class SheetTooLarge extends Error {
  constructor(message: string) {
    super(message);
    // Set by hand: a minified class name would not survive into the name.
    this.name = 'SheetTooLarge';
  }
}

/** A setting the visitor typed that cannot be used (a grid with no cells, say). */
export class BadGrid extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadGrid';
  }
}

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetFrame extends Cell {
  /** Milliseconds this frame stays on screen. */
  delay: number;
}

export interface Layout {
  columns: number;
  rows: number;
  width: number;
  height: number;
  padding: number;
  cells: Cell[];
}

/** Columns that make the sheet close to square for `count` cells of the given size. */
export function defaultColumns(count: number, cellW: number, cellH: number, padding = 0): number {
  const n = Math.max(1, count);
  const ratio = (cellH + padding) / (cellW + padding);
  return Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * ratio))));
}

/**
 * Where `count` cells of cellW x cellH go on a sheet. Padding is the gap between cells and around the
 * outside edge. `columns` of 0 (or undefined) picks a near-square grid. Throws SheetTooLarge, saying
 * what to change, when a side passes MAX_SIDE or the whole sheet passes `maxPixels`.
 */
export function layoutSheet(count: number, cellW: number, cellH: number, opts: { columns?: number; padding?: number; maxPixels?: number } = {}): Layout {
  if (!(count >= 1) || !(cellW >= 1) || !(cellH >= 1)) throw new BadGrid('There are no frames to put on a sheet.');
  const padding = Math.min(MAX_PADDING, Math.max(0, Math.round(opts.padding ?? 0)));
  const columns = Math.min(count, Math.max(1, Math.round(opts.columns || defaultColumns(count, cellW, cellH, padding))));
  const rows = Math.ceil(count / columns);
  const width = columns * cellW + (columns + 1) * padding;
  const height = rows * cellH + (rows + 1) * padding;
  const maxPixels = opts.maxPixels ?? MAX_PIXELS;
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > maxPixels) {
    const why = width > MAX_SIDE || height > MAX_SIDE ? `a side of ${Math.max(width, height).toLocaleString('en-US')} px, over the ${MAX_SIDE.toLocaleString('en-US')} px limit` : `${Math.round((width * height) / 1e6)} million pixels, more than this device can hold (${Math.round(maxPixels / 1e6)} million)`;
    throw new SheetTooLarge(
      `${count} frames of ${cellW} × ${cellH} px would make a ${width.toLocaleString('en-US')} × ${height.toLocaleString('en-US')} px sheet: ${why}. Nothing was drawn. Choose a smaller Frame size, a bigger Frame step (every 2nd or 3rd frame), or fewer frames.`,
    );
  }
  const cells: Cell[] = [];
  for (let i = 0; i < count; i++) {
    cells.push({ x: padding + (i % columns) * (cellW + padding), y: padding + Math.floor(i / columns) * (cellH + padding), w: cellW, h: cellH });
  }
  return { columns, rows, width, height, padding, cells };
}

/** The frame numbers (0-based) kept when every `step`th frame is used. */
export function keptCount(total: number, step: number): number {
  return Math.ceil(total / Math.max(1, Math.round(step)));
}

/**
 * The JSON saved beside the sheet: the sheet's size, then one entry per frame with its position, size and
 * delay in milliseconds. A plain list, not any one engine's format.
 */
export function sheetJson(image: string, layout: Layout, delays: number[]): string {
  const frames: SheetFrame[] = layout.cells.map((c, i) => ({ x: c.x, y: c.y, w: c.w, h: c.h, delay: delays[i] ?? 100 }));
  return JSON.stringify({ image, width: layout.width, height: layout.height, columns: layout.columns, rows: layout.rows, padding: layout.padding, frames }, null, 2);
}

/**
 * The cells of a sheet to cut. By columns and rows the cell size is what fits (the remainder is ignored);
 * by cell size the grid is what fits. `padding` is the gap between and around cells, as the maker writes it.
 */
export function sliceSheet(width: number, height: number, by: { columns: number; rows: number } | { cellW: number; cellH: number }, padding = 0): Layout {
  const pad = Math.min(MAX_PADDING, Math.max(0, Math.round(padding)));
  let columns: number;
  let rows: number;
  let cellW: number;
  let cellH: number;
  if ('columns' in by) {
    columns = Math.round(by.columns);
    rows = Math.round(by.rows);
    if (!(columns >= 1) || !(rows >= 1)) throw new BadGrid('Enter at least 1 column and 1 row.');
    cellW = Math.floor((width - (columns + 1) * pad) / columns);
    cellH = Math.floor((height - (rows + 1) * pad) / rows);
  } else {
    cellW = Math.round(by.cellW);
    cellH = Math.round(by.cellH);
    if (!(cellW >= 1) || !(cellH >= 1)) throw new BadGrid('Enter a cell width and height of at least 1 px.');
    columns = Math.floor((width - pad) / (cellW + pad));
    rows = Math.floor((height - pad) / (cellH + pad));
  }
  if (cellW < 1 || cellH < 1 || columns < 1 || rows < 1) {
    throw new BadGrid(`A ${width} × ${height} px sheet cannot be cut that way: the cells would be empty. Check the columns, rows or cell size.`);
  }
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) cells.push({ x: pad + c * (cellW + pad), y: pad + r * (cellH + pad), w: cellW, h: cellH });
  }
  return { columns, rows, width, height, padding: pad, cells };
}

/** How many cells to keep when the empty ones at the end are dropped: `empty[i]` is true for a blank cell. Keeps at least one. */
export function trimTrailingEmpty(empty: boolean[]): number {
  let n = empty.length;
  while (n > 1 && empty[n - 1]) n--;
  return n;
}
