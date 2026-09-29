/**
 * Stickers from cut-outs: the subject trimmed to its own outline, with an
 * optional die-cut border in a solid colour, as a transparent image. The
 * border is made by stamping a tinted silhouette of the subject in rings
 * around it, which follows every curve without any vector tracing.
 */
import { makeCanvas } from './image';

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface StickerOptions {
  /** Border width as a share of the subject's longer side (0 for none). */
  outline: number;
  color: string;
  /** Square canvas size in pixels (512 for WhatsApp and Telegram), or 0 to keep the subject's own size. */
  square: number;
}

/** Longest side of a sticker when no square size is asked for. */
const MAX_SIDE = 2048;
const MASK = 1024;

/** The subject's bounding box in image pixels, from the 1024 × 1024 mask. */
export function subjectBox(mask: Uint8ClampedArray, width: number, height: number) {
  let x0 = MASK, y0 = MASK, x1 = -1, y1 = -1;
  for (let y = 0; y < MASK; y++) {
    for (let x = 0; x < MASK; x++) {
      if (mask[y * MASK + x]! > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return undefined;
  const sx = width / MASK;
  const sy = height / MASK;
  const x = Math.max(0, Math.floor(x0 * sx) - 2);
  const y = Math.max(0, Math.floor(y0 * sy) - 2);
  return { x, y, w: Math.min(width, Math.ceil((x1 + 1) * sx) + 2) - x, h: Math.min(height, Math.ceil((y1 + 1) * sy) + 2) - y };
}

/** A copy of the cut-out with every visible pixel painted `color`. */
function silhouette(src: Canvas, color: string): Canvas {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d') as Ctx;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * The sticker. `cut` is the full-size cut-out (transparent background) and
 * `box` the subject's bounds within it.
 */
export function makeSticker(cut: Canvas, box: { x: number; y: number; w: number; h: number }, o: StickerOptions): Canvas {
  const long = Math.max(box.w, box.h);
  // Work at a size where the border ends up the same whatever the photo's resolution.
  const target = o.square ? o.square : Math.min(MAX_SIDE, long);
  const border = o.outline > 0 ? Math.max(2, Math.round(target * o.outline)) : 0;
  // WhatsApp asks for a 16 px margin on a 512 canvas; keep the same proportion.
  const margin = o.square ? Math.round(o.square * (16 / 512)) : Math.round(border * 0.5) + 2;
  const room = (o.square ? o.square : target + 2 * (border + margin)) - 2 * (border + margin);
  const scale = room / long;
  const w = Math.max(1, Math.round(box.w * scale));
  const h = Math.max(1, Math.round(box.h * scale));

  const subject = makeCanvas(w, h);
  const sctx = subject.getContext('2d') as Ctx;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(cut, box.x, box.y, box.w, box.h, 0, 0, w, h);

  const W = o.square || w + 2 * (border + margin);
  const H = o.square || h + 2 * (border + margin);
  const out = makeCanvas(W, H);
  const ctx = out.getContext('2d') as Ctx;
  const ox = Math.round((W - w) / 2);
  const oy = Math.round((H - h) / 2);
  if (border) {
    const tint = silhouette(subject, o.color);
    // Rings from the inside out so the border is solid, with enough steps round
    // each ring that there are no gaps between stamps.
    for (let r = 1; r <= border; r += Math.max(1, border / 6)) {
      const steps = Math.max(16, Math.ceil(r * 2));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        ctx.drawImage(tint, ox + Math.cos(a) * r, oy + Math.sin(a) * r);
      }
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ctx.drawImage(tint, ox + Math.cos(a) * border, oy + Math.sin(a) * border);
    }
  }
  ctx.drawImage(subject, ox, oy);
  return out;
}
