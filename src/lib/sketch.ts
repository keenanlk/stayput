/**
 * Photo to sketch, the classic "colour dodge" pencil effect: the picture is
 * turned grey, a blurred negative of it is made, and each grey value is
 * divided by the blurred negative. Flat areas go white and edges, where the
 * blur and the original differ, stay as pencil strokes. The blur radius sets
 * how thick the strokes are; darkness is a gamma curve on the result.
 */

/** Three passes of a box blur approximate a Gaussian; each pass is O(1) per pixel. */
export function blurChannel(src: Float32Array<ArrayBuffer>, w: number, h: number, radius: number): Float32Array<ArrayBuffer> {
  let a = src;
  let b = new Float32Array(src.length);
  const r = Math.max(1, Math.round(radius / 1.7));
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))]!;
      for (let x = 0; x < w; x++) {
        b[row + x] = sum / (2 * r + 1);
        sum += a[row + Math.min(w - 1, x + r + 1)]! - a[row + Math.max(0, x - r)]!;
      }
    }
    [a, b] = [b, a];
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += a[Math.min(h - 1, Math.max(0, y)) * w + x]!;
      for (let y = 0; y < h; y++) {
        b[y * w + x] = sum / (2 * r + 1);
        sum += a[Math.min(h - 1, y + r + 1) * w + x]! - a[Math.max(0, y - r) * w + x]!;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

export type SketchStyle = 'pencil' | 'charcoal' | 'color';

/**
 * Turn RGBA pixels into a sketch, in place. `radius` is the blur in pixels
 * (stroke thickness), `darkness` 0..100.
 */
export function sketch(data: Uint8ClampedArray, w: number, h: number, style: SketchStyle, radius: number, darkness: number): void {
  const n = w * h;
  const gray = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) gray[p] = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
  const inv = new Float32Array(n);
  for (let p = 0; p < n; p++) inv[p] = 255 - gray[p]!;
  const blurred = blurChannel(inv, w, h, radius);
  // Charcoal pushes the strokes darker and wider; darkness adds a gamma on top.
  const gamma = (style === 'charcoal' ? 2.2 : 1) * (1 + (darkness / 100) * 3);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const dodge = Math.min(255, (gray[p]! * 255) / Math.max(1, 255 - blurred[p]!));
    const v = 255 * Math.pow(dodge / 255, gamma);
    if (style === 'color') {
      // Tint the strokes with the photo's own colour, washed out towards white like coloured pencil.
      const k = v / 255;
      for (let c = 0; c < 3; c++) {
        const tinted = data[i + c]! * 0.85;
        data[i + c] = Math.round(tinted + (255 - tinted) * k);
      }
    } else {
      data[i] = data[i + 1] = data[i + 2] = Math.round(v);
    }
  }
}
