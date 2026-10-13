/**
 * Puts decoded YUV pictures into the one form every H.264 encoder reads the same way: limited range
 * (16 to 235), BT.709 colour matrix, even width and height. Old video is BT.601 (anything below HD)
 * or full range (the J variants Motion JPEG uses). WebCodecs lets a frame say which it is, but WebKit's
 * encoder ignores that, takes every plane as BT.709 and tags the file so, which turns saturated
 * colours wrong (a pure magenta comes out with a green cast). Converting here means the data and the
 * tag agree in every browser.
 */

export type Matrix = 'bt601' | 'bt709';
export interface YuvSource {
  /** Chroma planes are half size across (1) or full size (0), and the same down. */
  cw: 0 | 1;
  ch: 0 | 1;
  fullRange: boolean;
  matrix: Matrix;
}

const KR: Record<Matrix, number> = { bt601: 0.299, bt709: 0.2126 };
const KB: Record<Matrix, number> = { bt601: 0.114, bt709: 0.0722 };

/** Y'CbCr (Y 0..1, Cb and Cr -0.5..0.5) to R'G'B', for a matrix. */
function toRgb(m: Matrix, y: number, cb: number, cr: number): [number, number, number] {
  const kr = KR[m];
  const kb = KB[m];
  const r = y + 2 * (1 - kr) * cr;
  const b = y + 2 * (1 - kb) * cb;
  const g = (y - kr * r - kb * b) / (1 - kr - kb);
  return [r, g, b];
}

/** R'G'B' to Y'CbCr. */
function toYcc(m: Matrix, r: number, g: number, b: number): [number, number, number] {
  const kr = KR[m];
  const kb = KB[m];
  const y = kr * r + (1 - kr - kb) * g + kb * b;
  return [y, (b - y) / (2 * (1 - kb)), (r - y) / (2 * (1 - kr))];
}

/** The 3x3 matrix that takes the source's Y'CbCr to BT.709 Y'CbCr (the map is linear). */
export function conversionMatrix(from: Matrix): number[][] {
  const cols = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ].map(([y, cb, cr]) => toYcc('bt709', ...toRgb(from, y!, cb!, cr!)));
  // cols[j] is the output for input basis vector j: transpose into rows.
  return [0, 1, 2].map((i) => [cols[0]![i]!, cols[1]![i]!, cols[2]![i]!]);
}

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/**
 * `data` is a tightly packed Y, U, V picture of `width` x `height`. Returns a packed picture of
 * `outWidth` x `outHeight` (the top-left corner, so pass even sizes), limited range, BT.709.
 */
export function toLimitedBt709(data: Uint8Array, width: number, height: number, src: YuvSource, outWidth: number, outHeight: number): Uint8Array {
  const { cw, ch } = src;
  const inCw = (width + cw) >> cw;
  const inCh = (height + ch) >> ch;
  const outCw = (outWidth + cw) >> cw;
  const outCh = (outHeight + ch) >> ch;
  const out = new Uint8Array(outWidth * outHeight + 2 * outCw * outCh);
  const uAt = width * height;
  const vAt = uAt + inCw * inCh;

  const y0 = src.fullRange ? 0 : 16;
  const yScale = src.fullRange ? 1 / 255 : 1 / 219;
  const cScale = src.fullRange ? 1 / 255 : 1 / 224;
  const noChange = src.matrix === 'bt709' && !src.fullRange;
  const m = conversionMatrix(src.matrix);
  const [[, my1, my2], [, mb1, mb2], [, mr1, mr2]] = m as [number[], number[], number[]];
  const crop = outWidth === width && outHeight === height;

  if (noChange && crop) return data.slice(0, out.length);

  // Luma: needs each pixel's own chroma, because the BT.709 luma depends a little on Cb and Cr.
  for (let y = 0; y < outHeight; y++) {
    const cRow = (y >> ch) * inCw;
    for (let x = 0; x < outWidth; x++) {
      const yn = (data[y * width + x]! - y0) * yScale;
      if (noChange) {
        out[y * outWidth + x] = data[y * width + x]!;
        continue;
      }
      const ci = cRow + (x >> cw);
      const cb = (data[uAt + ci]! - 128) * cScale;
      const cr = (data[vAt + ci]! - 128) * cScale;
      out[y * outWidth + x] = clamp8(16 + 219 * (yn + my1! * cb + my2! * cr));
    }
  }
  // Chroma: Cb and Cr of the new matrix depend only on the old Cb and Cr.
  const oU = outWidth * outHeight;
  const oV = oU + outCw * outCh;
  for (let y = 0; y < outCh; y++) {
    for (let x = 0; x < outCw; x++) {
      const ci = y * inCw + x;
      if (noChange) {
        out[oU + y * outCw + x] = data[uAt + ci]!;
        out[oV + y * outCw + x] = data[vAt + ci]!;
        continue;
      }
      const cb = (data[uAt + ci]! - 128) * cScale;
      const cr = (data[vAt + ci]! - 128) * cScale;
      out[oU + y * outCw + x] = clamp8(128 + 224 * (mb1! * cb + mb2! * cr));
      out[oV + y * outCw + x] = clamp8(128 + 224 * (mr1! * cb + mr2! * cr));
    }
  }
  return out;
}
