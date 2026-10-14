/**
 * A static text or logo watermark for video frames, drawn on the 2D canvas
 * that src/lib/video-edit.ts hands to its `paint` step. The same drawing
 * serves the preview, so what you see is what every frame gets.
 */
export type Place = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export const PLACES: readonly Place[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];

export interface VideoWatermark {
  kind: 'text' | 'image';
  text: string;
  /** Decoded logo, for kind 'image'. */
  image?: ImageBitmap | HTMLCanvasElement | HTMLImageElement;
  place: Place;
  /** 1 to 10: how big the mark is relative to the picture's width. */
  size: number;
  /** 0 to 1. */
  opacity: number;
  color: string;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const FONT = '700 {px}px "Helvetica Neue", Helvetica, Arial, "Noto Sans", sans-serif';

export const isPlace = (v: string): v is Place => (PLACES as readonly string[]).includes(v);

/** True when there is something to draw. */
export function hasMark(o: VideoWatermark): boolean {
  return o.kind === 'image' ? !!o.image : !!o.text.trim();
}

/** Draw the mark over the frame already on the canvas (w × h). */
export function drawVideoWatermark(ctx: Ctx, w: number, h: number, o: VideoWatermark): void {
  if (!hasMark(o)) return;
  const size = Math.min(10, Math.max(1, o.size));
  const margin = Math.round(Math.min(w, h) * 0.03);
  // The mark's box: width wanted is 4% to 40% of the picture, kept inside the picture.
  const maxW = Math.max(1, w - margin * 2);
  const maxH = Math.max(1, h - margin * 2);
  let bw: number;
  let bh: number;
  let px = 0;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, o.opacity));
  if (o.kind === 'image') {
    const img = o.image!;
    const iw = 'naturalWidth' in img ? img.naturalWidth || img.width : img.width;
    const ih = 'naturalHeight' in img ? img.naturalHeight || img.height : img.height;
    const s = Math.min((w * size * 0.04) / iw, maxW / iw, maxH / ih);
    bw = Math.max(1, Math.round(iw * s));
    bh = Math.max(1, Math.round(ih * s));
  } else {
    const text = o.text.trim();
    px = Math.max(8, w * (0.008 + size * 0.006) * 2);
    const setFont = () => (ctx.font = FONT.replace('{px}', String(Math.round(px * 100) / 100)));
    setFont();
    const tw = ctx.measureText(text).width;
    if (tw > maxW) {
      px *= maxW / tw;
      setFont();
    }
    bw = Math.ceil(ctx.measureText(text).width);
    bh = Math.ceil(px);
  }
  const x = o.place.endsWith('left') ? margin : o.place.endsWith('right') ? w - margin - bw : Math.round((w - bw) / 2);
  const y = o.place.startsWith('top') ? margin : o.place.startsWith('bottom') ? h - margin - bh : Math.round((h - bh) / 2);
  if (o.kind === 'image') {
    ctx.drawImage(o.image!, x, y, bw, bh);
  } else {
    ctx.fillStyle = o.color;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(o.text.trim(), x, y);
  }
  ctx.restore();
}
