/**
 * Passport and visa photo layout. The head is measured from the top of the
 * hair (the highest subject pixel above the face, from the cut-out model) to
 * the chin (estimated from the face detector's eyes and mouth), then the photo
 * is scaled and cropped so the head fills the middle of the size's allowed
 * range. Everything is drawn at 600 pixels per inch, which meets the digital
 * minimums, and tiled onto a 4 × 6 inch print sheet at 300 pixels per inch.
 */
import { makeCanvas } from './image';
import type { Landmarks } from './faces';

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface PhotoSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  /** Allowed head height, chin to top of the head. */
  headMinMm: number;
  headMaxMm: number;
  /** Allowed height of the eyes above the bottom edge, where the rules set one. */
  eyesMinMm?: number;
  eyesMaxMm?: number;
}

export const sizes: PhotoSize[] = [
  { id: 'us', label: '2 × 2 in (51 × 51 mm): US passport and visa', widthMm: 50.8, heightMm: 50.8, headMinMm: 25.4, headMaxMm: 34.9, eyesMinMm: 28.6, eyesMaxMm: 34.9 },
  { id: 'eu', label: '35 × 45 mm: Schengen visa and most European passports', widthMm: 35, heightMm: 45, headMinMm: 32, headMaxMm: 36 },
];

export const sizeById = (id: string): PhotoSize => sizes.find((s) => s.id === id) ?? sizes[0]!;

const MM_PER_IN = 25.4;
export const PHOTO_DPI = 600;
const SHEET_DPI = 300;

export interface Head {
  /** Top of the hair, eye line, chin, and the face's centre line, in image pixels. */
  top: number;
  eyes: number;
  chin: number;
  cx: number;
}

/**
 * Chin from the eyes and mouth: with a neutral expression the chin sits about
 * half the eye-to-mouth distance below the centre of the mouth. (The detector's
 * box is no help here: it often runs well past the chin.)
 */
export function chinY(face: Landmarks): number {
  return face.mouth.y + (face.mouth.y - face.eyes.y) * 0.5;
}

/** Highest subject row above the face in a 1024 × 1024 mask, in image pixels. */
export function crownY(mask: Uint8ClampedArray, face: Landmarks, width: number, height: number): number {
  const N = 1024;
  const x0 = Math.max(0, Math.floor(((face.box.x + face.box.w * 0.2) / width) * N));
  const x1 = Math.min(N - 1, Math.ceil(((face.box.x + face.box.w * 0.8) / width) * N));
  const limit = Math.floor((face.eyes.y / height) * N);
  for (let y = 0; y < limit; y++) {
    let on = 0;
    for (let x = x0; x <= x1; x++) if (mask[y * N + x]! > 127) on++;
    // A few stray hairs are not the top of the head: need a real run of subject.
    if (on >= Math.max(3, (x1 - x0) * 0.08)) return (y / N) * height;
  }
  return face.box.y;
}

export function measureHead(mask: Uint8ClampedArray, face: Landmarks, width: number, height: number): Head {
  return { top: crownY(mask, face, width, height), eyes: face.eyes.y, chin: chinY(face), cx: face.eyes.x };
}

export const px = (mm: number, dpi: number) => Math.round((mm / MM_PER_IN) * dpi);

/**
 * Where the source photo lands in the passport frame: head scaled to the middle
 * of the allowed range and centred left to right. Where the rules give an eye
 * height (US), the eyes go in the middle of it; otherwise 40% of the spare
 * height goes above the head and 60% below (neck and shoulders). The top of the
 * hair is never pushed out of the frame.
 */
export function placement(head: Head, size: PhotoSize, dpi = PHOTO_DPI) {
  const W = px(size.widthMm, dpi);
  const H = px(size.heightMm, dpi);
  const headPx = px((size.headMinMm + size.headMaxMm) / 2, dpi);
  const scale = headPx / Math.max(1, head.chin - head.top);
  const minTop = H * 0.03;
  let top = minTop + (H - headPx - minTop) * 0.4;
  if (size.eyesMinMm && size.eyesMaxMm) {
    const eyesAt = H - px((size.eyesMinMm + size.eyesMaxMm) / 2, dpi);
    top = Math.max(minTop, eyesAt - (head.eyes - head.top) * scale);
  }
  return { W, H, scale, dx: W / 2 - head.cx * scale, dy: top - head.top * scale, headMm: ((head.chin - head.top) * scale * MM_PER_IN) / dpi };
}

/**
 * The passport photo: the source scaled into place, on `background` where the
 * frame runs past the photo's edge. `subject` (a cut-out on transparency) is
 * drawn instead of the photo when the background is being replaced.
 */
export function renderPhoto(source: ImageBitmap | Canvas, head: Head, size: PhotoSize, background: string): Canvas {
  const { W, H, scale, dx, dy } = placement(head, size);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, dx, dy, source.width * scale, source.height * scale);
  return canvas;
}

/** As many copies as fit on a 4 × 6 inch print, with thin grey cutting lines. */
export function renderSheet(photo: Canvas, size: PhotoSize): { canvas: Canvas; copies: number } {
  const SW = 4 * SHEET_DPI;
  const SH = 6 * SHEET_DPI;
  const w = px(size.widthMm, SHEET_DPI);
  const h = px(size.heightMm, SHEET_DPI);
  const gap = px(3, SHEET_DPI);
  // Try both orientations of the grid and keep the one that fits more.
  const fit = (sw: number, sh: number) => ({ cols: Math.floor((sw + gap) / (w + gap)), rows: Math.floor((sh + gap) / (h + gap)) });
  const up = fit(SW, SH);
  const side = fit(SH, SW);
  const landscape = side.cols * side.rows > up.cols * up.rows;
  const { cols, rows } = landscape ? side : up;
  const cw = landscape ? SH : SW;
  const ch = landscape ? SW : SH;
  const canvas = makeCanvas(cw, ch);
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  const x0 = Math.round((cw - (cols * w + (cols - 1) * gap)) / 2);
  const y0 = Math.round((ch - (rows * h + (rows - 1) * gap)) / 2);
  ctx.imageSmoothingQuality = 'high';
  ctx.strokeStyle = '#b0b0b0';
  ctx.lineWidth = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (w + gap);
      const y = y0 + r * (h + gap);
      ctx.drawImage(photo, x, y, w, h);
      ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    }
  }
  return { canvas, copies: cols * rows };
}
