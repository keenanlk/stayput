/**
 * Pixel size to draw an SVG at when its root has no usable width and height
 * (only a viewBox): the viewBox shape, scaled so the long side is 1024.
 * Returns undefined when the SVG has its own size or no viewBox.
 */
export function svgFallbackSize(text: string): { width: number; height: number } | undefined {
  const root = text.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) return undefined;
  const attr = (name: string) => root.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
  const absolute = (v?: string) => v !== undefined && /^\s*[\d.]+\s*(px|pt|pc|mm|cm|in)?\s*$/i.test(v) && parseFloat(v) > 0;
  if (absolute(attr('width')) && absolute(attr('height'))) return undefined;
  const box = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!box || box.length !== 4 || !(box[2]! > 0) || !(box[3]! > 0)) return undefined;
  const k = 1024 / Math.max(box[2]!, box[3]!);
  return { width: Math.max(1, Math.round(box[2]! * k)), height: Math.max(1, Math.round(box[3]! * k)) };
}
