/**
 * Drawing captions onto video frames for Add subtitles to video: sizes
 * relative to the picture, and three looks people expect from social video
 * and TV (white with a black edge, white on a dark band, yellow).
 */

export type Look = 'outline' | 'box' | 'yellow';
export type Size = 'small' | 'medium' | 'large';
export type Place = 'bottom' | 'top';

/** Letter height as a share of the picture's shorter side. */
const SCALE: Record<Size, number> = { small: 0.05, medium: 0.065, large: 0.085 };

export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans CJK JP", "Helvetica Neue", Arial, sans-serif';

export function captionFont(width: number, height: number, size: Size): { px: number; font: string; maxWidth: number } {
  const px = Math.max(12, Math.round(Math.min(width, height) * SCALE[size]));
  return { px, font: `700 ${px}px ${FONT_FAMILY}`, maxWidth: width * 0.88 };
}

/** Draw one caption (lines separated by \n), centred, near the bottom or top of the frame. */
export function drawCaption(ctx: CanvasRenderingContext2D, text: string, look: Look, place: Place, px: number, font: string) {
  const { width, height } = ctx.canvas;
  const lines = text.split('\n');
  const lineH = Math.round(px * 1.25);
  const margin = Math.round(height * 0.06);
  const block = lineH * lines.length;
  const top = place === 'top' ? margin : height - margin - block;
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  lines.forEach((line, i) => {
    const y = top + lineH * i + lineH / 2;
    if (look === 'box') {
      const w = ctx.measureText(line).width + px * 0.6;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.fillRect(Math.round(width / 2 - w / 2), Math.round(y - lineH / 2), Math.round(w), lineH);
    } else {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = Math.max(2, px * 0.16);
      ctx.strokeText(line, width / 2, y);
    }
    ctx.fillStyle = look === 'yellow' ? '#ffd400' : '#fff';
    ctx.fillText(line, width / 2, y);
  });
  ctx.restore();
}
