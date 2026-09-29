/**
 * Text watermarks drawn on a 2D canvas. Shared by the image and PDF
 * watermark tools and their previews, so the preview matches the file. For a
 * PDF, each page's watermark is drawn on a transparent layer the size of the
 * page and stamped on top (see pdf.ts `stampPdf`).
 */
export type Layout = 'center' | 'tiled' | 'corner';

export interface WatermarkOptions {
  text: string;
  layout: Layout;
  /** 1 to 10: text height relative to the shorter side of the page or photo. */
  size: number;
  /** 0 to 1. */
  opacity: number;
  color: string;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const FONT = '600 {px}px "Helvetica Neue", Helvetica, Arial, "Noto Sans", sans-serif';

/** Font size in pixels for an area of w × h. */
export function fontPx(size: number, w: number, h: number): number {
  const s = Math.min(10, Math.max(1, size));
  return Math.max(6, Math.min(w, h) * (0.015 + s * 0.011));
}

/** Draw the watermark over whatever is already on the canvas, filling w × h from the origin. */
export function drawWatermark(ctx: Ctx, w: number, h: number, o: WatermarkOptions): void {
  const text = o.text.trim();
  if (!text) return;
  let px = fontPx(o.size, w, h);
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, o.opacity));
  ctx.fillStyle = o.color;
  ctx.textBaseline = 'middle';
  const setFont = () => (ctx.font = FONT.replace('{px}', String(Math.round(px * 100) / 100)));
  setFont();

  if (o.layout === 'center') {
    // Across the diagonal, shrunk if needed so the text stays on the page.
    const angle = -Math.atan2(h, w);
    const room = Math.hypot(w, h) * 0.85;
    const tw = ctx.measureText(text).width;
    if (tw > room) {
      px *= room / tw;
      setFont();
    }
    ctx.textAlign = 'center';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.fillText(text, 0, 0);
  } else if (o.layout === 'tiled') {
    // A repeated grid at 30°, covering every corner, so the mark cannot be cropped away.
    const angle = -Math.PI / 6;
    const tw = ctx.measureText(text).width;
    const stepX = tw + px * 2.5;
    const stepY = px * 4;
    const reach = Math.hypot(w, h);
    ctx.textAlign = 'left';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    let row = 0;
    for (let y = -reach / 2; y <= reach / 2 + stepY; y += stepY, row++) {
      // Every other row shifts by half a step, like bricks.
      const shift = (row % 2) * (stepX / 2);
      for (let x = -reach / 2 - stepX + shift; x <= reach / 2; x += stepX) ctx.fillText(text, x, y);
    }
  } else {
    const margin = px * 0.9;
    const maxW = w - margin * 2;
    const tw = ctx.measureText(text).width;
    if (tw > maxW) {
      px *= maxW / tw;
      setFont();
    }
    ctx.textAlign = 'right';
    ctx.fillText(text, w - margin, h - margin - px * 0.1);
  }
  ctx.restore();
}
