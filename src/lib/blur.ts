/**
 * Hide parts of an image on a 2D canvas: pixelate, blur or cover with a solid
 * box. Used by the blur tool for both the on-screen preview and the full-size
 * output, so what you see is what you download. No dependency: the blur is
 * three passes of a running-sum box blur, which is close to a Gaussian.
 */
export type Effect = 'pixelate' | 'blur' | 'box';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Clip a rectangle to the canvas and round it to whole pixels. */
export function clipRect(r: Rect, width: number, height: number): Rect | undefined {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(width, Math.ceil(r.x + r.w));
  const y1 = Math.min(height, Math.ceil(r.y + r.h));
  if (x1 - x0 < 1 || y1 - y0 < 1) return undefined;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Effect size in pixels for a strength of 1 to 10, relative to the image's
 * shorter side, so a setting looks the same on a thumbnail and a 48 MP photo.
 */
export function effectSize(strength: number, width: number, height: number): number {
  const s = Math.min(10, Math.max(1, strength));
  return Math.max(2, Math.round(Math.min(width, height) * s * 0.006));
}

/** Replace each block of the rectangle with its average colour. Blocks start at the rectangle's corner. */
export function pixelate(ctx: Ctx, rect: Rect, block: number): void {
  const r = clipRect(rect, ctx.canvas.width, ctx.canvas.height);
  if (!r) return;
  const b = Math.max(1, Math.round(block));
  const img = ctx.getImageData(r.x, r.y, r.w, r.h);
  const d = img.data;
  for (let by = 0; by < r.h; by += b) {
    const bh = Math.min(b, r.h - by);
    for (let bx = 0; bx < r.w; bx += b) {
      const bw = Math.min(b, r.w - bx);
      let rs = 0, gs = 0, bs = 0, as = 0;
      for (let y = by; y < by + bh; y++) {
        let i = (y * r.w + bx) * 4;
        for (let x = 0; x < bw; x++, i += 4) {
          const a = d[i + 3]!;
          // Weight colour by alpha so transparent pixels do not darken the block.
          rs += d[i]! * a;
          gs += d[i + 1]! * a;
          bs += d[i + 2]! * a;
          as += a;
        }
      }
      const n = bw * bh;
      const cr = as ? rs / as : 0;
      const cg = as ? gs / as : 0;
      const cb = as ? bs / as : 0;
      const ca = as / n;
      for (let y = by; y < by + bh; y++) {
        let i = (y * r.w + bx) * 4;
        for (let x = 0; x < bw; x++, i += 4) {
          d[i] = cr;
          d[i + 1] = cg;
          d[i + 2] = cb;
          d[i + 3] = ca;
        }
      }
    }
  }
  ctx.putImageData(img, r.x, r.y);
}

/** One horizontal or vertical box-blur pass with edge clamping, from src into dst. */
function boxPass(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, radius: number, horizontal: boolean): void {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 4 : w * 4;
  const win = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * w * 4 : line * 4;
    for (let c = 0; c < 4; c++) {
      const at = (k: number) => src[start + Math.min(len - 1, Math.max(0, k)) * step + c]!;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += at(k);
      for (let k = 0; k < len; k++) {
        dst[start + k * step + c] = sum / win;
        sum += at(k + radius + 1) - at(k - radius);
      }
    }
  }
}

/**
 * Blur the rectangle. Pixels around it are read (not changed) so the edge of
 * the blurred area blends into the photo instead of fading to its own border.
 */
export function blur(ctx: Ctx, rect: Rect, radius: number): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const r = clipRect(rect, W, H);
  if (!r) return;
  const rad = Math.max(1, Math.round(radius / 2));
  const pad = rad * 3;
  const p = clipRect({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }, W, H)!;
  const img = ctx.getImageData(p.x, p.y, p.w, p.h);
  const a = img.data;
  const b = new Uint8ClampedArray(a.length);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, p.w, p.h, rad, true);
    boxPass(b, a, p.w, p.h, rad, false);
  }
  ctx.putImageData(img, p.x, p.y, r.x - p.x, r.y - p.y, r.w, r.h);
}

/** Cover the rectangle with solid black: the only effect that cannot be reversed for text. */
export function box(ctx: Ctx, rect: Rect): void {
  const r = clipRect(rect, ctx.canvas.width, ctx.canvas.height);
  if (!r) return;
  ctx.fillStyle = '#000000';
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

export function apply(ctx: Ctx, effect: Effect, rect: Rect, size: number): void {
  if (effect === 'pixelate') pixelate(ctx, rect, size);
  else if (effect === 'blur') blur(ctx, rect, size);
  else box(ctx, rect);
}
