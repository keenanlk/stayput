/**
 * Image to ASCII art. Dependency-free so specs can import it.
 * A small RGBA grid goes in (already shrunk to one pixel per character); plain text comes out.
 */

/** Character sets, each ordered from the lightest ink (blank paper) to the heaviest. */
export const CHARSETS: Record<string, string> = {
  classic: ' .:-=+*#%@',
  blocks: ' ░▒▓█',
  simple: ' .-+#',
};

export const MIN_COLS = 40;
export const MAX_COLS = 200;
export const DEFAULT_COLS = 100;
/** A monospace cell is about twice as tall as it is wide, so rows are halved to keep the picture's shape. */
export const CELL_ASPECT = 0.5;
/** Tall pictures would otherwise make thousands of lines; columns are reduced to stay under this. */
export const MAX_ROWS = 600;

/** The character grid for a picture: `cols` columns and the rows that keep its proportions. */
export function gridSize(width: number, height: number, cols: number): { cols: number; rows: number } {
  let c = Math.max(1, Math.round(cols));
  let rows = Math.max(1, Math.round((c * height * CELL_ASPECT) / width));
  if (rows > MAX_ROWS) {
    c = Math.max(1, Math.floor((c * MAX_ROWS) / rows));
    rows = Math.max(1, Math.min(MAX_ROWS, Math.round((c * height * CELL_ASPECT) / width)));
  }
  return { cols: c, rows };
}

/** Rec. 709 luminance, 0 (black) to 1 (white). */
export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** The ramp for a set name or custom text: control characters and repeats dropped; too short a custom set falls back to classic. */
export function rampFor(set: string, custom = ''): string[] {
  if (set === 'custom') {
    const seen = new Set<string>();
    for (const ch of Array.from(custom)) if (ch >= ' ' && ch !== '\u007f' && !seen.has(ch)) seen.add(ch);
    if (seen.size >= 2) return [...seen];
    return Array.from(CHARSETS.classic!);
  }
  return Array.from(CHARSETS[set] ?? CHARSETS.classic!);
}

/**
 * One character per pixel. Transparent pixels count as white paper. Dark pixels get the
 * heaviest character, or the lightest when `invert` is set (light text on a dark background).
 */
export function toAscii(rgba: Uint8ClampedArray | Uint8Array, cols: number, rows: number, ramp: string[], invert: boolean): string {
  const last = ramp.length - 1;
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const a = rgba[i + 3]! / 255;
      const l = luminance(
        rgba[i]! * a + 255 * (1 - a),
        rgba[i + 1]! * a + 255 * (1 - a),
        rgba[i + 2]! * a + 255 * (1 - a),
      );
      const ink = invert ? l : 1 - l;
      line += ramp[Math.round(ink * last)]!;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
