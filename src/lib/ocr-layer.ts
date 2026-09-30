/**
 * Placing recognised words as invisible text over a scanned PDF page, so the
 * page can be searched, selected and copied while it looks exactly the same.
 * Pure geometry: `toPdf` maps a pixel of the rendered page to PDF user space
 * (pdf.js's viewport.convertToPdfPoint, which accounts for page rotation and
 * crop box), and `widthOf` measures text in the embedded font.
 */
import type { OcrWord } from './ocr';

export interface PlacedWord {
  text: string;
  size: number;
  /** Text matrix [a b c d e f]: unit vectors along and across the baseline, and the origin. */
  matrix: [number, number, number, number, number, number];
  /** Horizontal scaling (Tz), in percent, so the word spans the width it has on the scan. */
  scale: number;
}

/** Share of the line height taken by the font size: Helvetica's caps and descenders fill about this much. */
const SIZE_OF_LINE = 0.85;

export function placeWords(
  words: OcrWord[],
  toPdf: (x: number, y: number) => [number, number],
  widthOf: (text: string, size: number) => number,
): PlacedWord[] {
  const out: PlacedWord[] = [];
  for (const w of words) {
    // Without Tesseract's baseline, it sits a little above the bottom of the box, where descenders end.
    const [base0, base1] = w.baseline ?? [w.y1 - w.lineHeight * 0.15, w.y1 - w.lineHeight * 0.15];
    const [ax, ay] = toPdf(w.x0, base0);
    const [bx, by] = toPdf(w.x1, base1);
    const [tx, ty] = toPdf(w.x0, base0 - w.lineHeight);
    const along = Math.hypot(bx - ax, by - ay);
    const lineHeight = Math.hypot(tx - ax, ty - ay);
    if (along < 0.5 || lineHeight < 0.5) continue;
    const ux = (bx - ax) / along;
    const uy = (by - ay) / along;
    const size = Math.max(1, lineHeight * SIZE_OF_LINE);
    const natural = widthOf(w.text, size);
    if (natural <= 0) continue;
    out.push({
      text: w.text,
      size,
      matrix: [ux, uy, -uy, ux, ax, ay],
      scale: Math.max(10, Math.min(1000, (along / natural) * 100)),
    });
  }
  return out;
}

/** Characters the standard Helvetica font (WinAnsi) can write; anything else becomes a close ASCII stand-in or is dropped. */
export function winAnsi(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/[^\x20-\x7e -ÿ€]/g, '');
}
