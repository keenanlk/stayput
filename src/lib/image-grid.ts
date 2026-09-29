/**
 * Where to cut an image into a grid of equal tiles: the part of the image
 * that is kept (centred, when the tiles must have a set shape) and each tile's
 * rectangle inside it, in reading order.
 */

export type TileShape = 'original' | 'square' | 'portrait';

export interface Rect { x: number; y: number; w: number; h: number }

export interface GridPlan {
  crop: Rect;
  tileW: number;
  tileH: number;
  /** Reading order: left to right, top row first. */
  tiles: (Rect & { row: number; col: number })[];
}

/** Width over height of one tile. Portrait is Instagram's 4:5. */
const ASPECT: Record<Exclude<TileShape, 'original'>, number> = { square: 1, portrait: 4 / 5 };

export function planGrid(width: number, height: number, cols: number, rows: number, shape: TileShape): GridPlan {
  let cw = width;
  let ch = height;
  if (shape !== 'original') {
    const want = (cols * ASPECT[shape]) / rows;
    if (width / height > want) cw = Math.round(height * want);
    else ch = Math.round(width / want);
  }
  const tileW = Math.max(1, Math.floor(cw / cols));
  const tileH = Math.max(1, Math.floor(ch / rows));
  // Whole tiles only: share any leftover pixels between both edges.
  const crop = { x: Math.floor((width - tileW * cols) / 2), y: Math.floor((height - tileH * rows) / 2), w: tileW * cols, h: tileH * rows };
  const tiles: GridPlan['tiles'] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) tiles.push({ row, col, x: crop.x + col * tileW, y: crop.y + row * tileH, w: tileW, h: tileH });
  }
  return { crop, tileW, tileH, tiles };
}
