/**
 * Text drawn onto an image: one or two blocks of wrapped text, each centred on
 * a point given as a fraction of the image, in a shared style. Sizes are a
 * share of the image's shorter side, so the same settings look the same on a
 * 4000 px photo and on its preview.
 */

export type FontChoice = 'sans' | 'impact' | 'serif' | 'hand' | 'mono';
export type Effect = 'outline' | 'shadow' | 'box' | 'none';

export interface TextBlock {
  text: string;
  /** Centre of the block, 0 to 1 across and down the image. */
  x: number;
  y: number;
}

export interface TextStyle {
  font: FontChoice;
  /** Letter height as a percentage of the image's shorter side. */
  size: number;
  color: string;
  effect: Effect;
  /** 0 to 1. */
  opacity: number;
  upper: boolean;
  align: CanvasTextAlign;
}

export function fontFor(choice: FontChoice, px: number): string {
  switch (choice) {
    case 'impact':
      return `${px}px Impact, Haettenschweiler, "Arial Narrow Bold", "Archivo", sans-serif`;
    case 'serif':
      return `700 ${px}px Georgia, "Times New Roman", serif`;
    case 'hand':
      return `500 ${px}px Caveat, "Segoe Print", "Bradley Hand", cursive`;
    case 'mono':
      return `700 ${px}px ui-monospace, Menlo, Consolas, "Courier New", monospace`;
    default:
      return `800 ${px}px Archivo, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  }
}

/** Make sure a web font is ready before drawing, so the first preview is not in a fallback face. */
export async function loadFont(choice: FontChoice): Promise<void> {
  if (!('fonts' in document)) return;
  if (choice !== 'hand' && choice !== 'sans') return;
  try {
    await document.fonts.load(fontFor(choice, 40), 'Aa');
  } catch {
    /* the fallback family is fine */
  }
}

/** Split into lines that fit `max` pixels, keeping the user's own line breaks. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = words[0]!;
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (ctx.measureText(next).width <= max) line = next;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

export interface Box { x: number; y: number; w: number; h: number }

/** Draw the blocks on a canvas already holding the image. Returns each block's box, for hit testing. */
export function drawText(ctx: CanvasRenderingContext2D, width: number, height: number, blocks: TextBlock[], style: TextStyle): Box[] {
  const px = Math.max(6, Math.round((Math.min(width, height) * style.size) / 100));
  const lineH = Math.round(px * 1.15);
  const boxes: Box[] = [];
  ctx.save();
  ctx.font = fontFor(style.font, px);
  ctx.textBaseline = 'middle';
  ctx.textAlign = style.align;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = style.opacity;
  for (const b of blocks) {
    const text = style.upper ? b.text.toUpperCase() : b.text;
    if (!text.trim()) {
      boxes.push({ x: 0, y: 0, w: 0, h: 0 });
      continue;
    }
    const lines = wrapLines(ctx, text, width * 0.92);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const h = lines.length * lineH;
    const cx = b.x * width;
    const cy = b.y * height;
    // Keep the block inside the picture.
    const left = Math.min(Math.max(cx - w / 2, width * 0.02), Math.max(width * 0.02, width * 0.98 - w));
    const top = Math.min(Math.max(cy - h / 2, height * 0.02), Math.max(height * 0.02, height * 0.98 - h));
    const anchor = style.align === 'left' ? left : style.align === 'right' ? left + w : left + w / 2;
    if (style.effect === 'box') {
      const pad = px * 0.35;
      ctx.fillStyle = isLight(style.color) ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.82)';
      ctx.beginPath();
      ctx.roundRect(left - pad, top - pad * 0.6, w + pad * 2, h + pad * 1.2, pad * 0.6);
      ctx.fill();
    }
    lines.forEach((line, i) => {
      const y = top + lineH * i + lineH / 2;
      if (style.effect === 'outline') {
        ctx.lineWidth = Math.max(2, px * 0.12);
        ctx.strokeStyle = isLight(style.color) ? '#000' : '#fff';
        ctx.strokeText(line, anchor, y);
      }
      if (style.effect === 'shadow') {
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = px * 0.25;
        ctx.shadowOffsetY = px * 0.06;
      }
      ctx.fillStyle = style.color;
      ctx.fillText(line, anchor, y);
      ctx.shadowColor = 'transparent';
    });
    boxes.push({ x: left, y: top, w, h });
  }
  ctx.restore();
  return boxes;
}

/** True for colours that need a dark outline or backing. */
export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return true;
  const n = parseInt(m[1]!, 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}
