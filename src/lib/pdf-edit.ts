import type * as PdfLib from 'pdf-lib';
import { displayedSize, displayedToUserSpace, loadDocument, loadPdfLib } from './pdf';

export type EditFont = 'helvetica' | 'times' | 'courier';

/** All positions are fractions 0..1 of the displayed (unrotated by this tool) page, origin top-left. */
export type Edit =
  | {
      kind: 'text';
      page: number;
      x: number;
      y: number;
      text: string;
      /** Point size. */
      size: number;
      color: string;
      font: EditFont;
      /** Set when the text has characters a standard PDF font cannot draw: the line rendered as a picture instead. */
      picture?: { png: Uint8Array; width: number; height: number };
    }
  | { kind: 'cover' | 'highlight'; page: number; x: number; y: number; width: number; height: number; color: string }
  | { kind: 'draw'; page: number; points: [number, number][]; color: string; thickness: number }
  | { kind: 'image'; page: number; x: number; y: number; width: number; height: number; png: Uint8Array };

export interface PageLayout {
  /** Zero-based source page indexes in the output order. Missing = deleted. */
  order: number[];
  /** Degrees added to a source page's own rotation (multiples of 90). */
  turn: Record<number, number>;
}

/** Where a text line's baseline sits below its top edge, as a share of the size. */
export const BASELINE = 0.8;
/** Pixel size a fallback picture of text is rendered at; its point size scales from this. */
export const PICTURE_PX = 96;

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const fontName = (lib: typeof PdfLib, f: EditFont) => (f === 'times' ? lib.StandardFonts.TimesRoman : f === 'courier' ? lib.StandardFonts.Courier : lib.StandardFonts.Helvetica);

/** True when a standard PDF font can draw every character of `text` as real, selectable text. */
export async function drawableAsText(text: string, font: EditFont = 'helvetica'): Promise<boolean> {
  const lib = await loadPdfLib();
  const doc = await lib.PDFDocument.create();
  const f = await doc.embedFont(fontName(lib, font));
  try {
    f.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

export function isIdentity(layout: PageLayout, total: number): boolean {
  return layout.order.length === total && layout.order.every((p, i) => p === i) && Object.values(layout.turn).every((t) => ((t % 360) + 360) % 360 === 0);
}

/**
 * Draw the edits onto the source pages (so coordinates always refer to the page as the editor
 * showed it), then drop, reorder and turn pages.
 */
export async function applyEdits(source: Uint8Array, edits: Edit[], layout: PageLayout, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
  const lib = await loadPdfLib();
  const { rgb, degrees, LineCapStyle } = lib;
  const doc = await loadDocument(source);
  const pages = doc.getPages();
  const fonts = new Map<EditFont, PdfLib.PDFFont>();
  const pngs = new Map<Uint8Array, PdfLib.PDFImage>();
  const image = async (png: Uint8Array) => {
    let img = pngs.get(png);
    if (!img) {
      img = await doc.embedPng(png);
      pngs.set(png, img);
    }
    return img;
  };
  for (const [i, e] of edits.entries()) {
    const page = pages[e.page];
    if (!page) continue;
    const { w: dw, h: dh } = displayedSize(page);
    // Bottom-left corner of a box whose top-left is (x, y) and whose height is h points.
    const corner = (x: number, y: number, hPts: number) => displayedToUserSpace(page, x, 1 - y - hPts / dh);
    if (e.kind === 'text') {
      if (e.picture) {
        const img = await image(e.picture.png);
        const k = e.size / PICTURE_PX;
        const w = e.picture.width * k;
        const h = e.picture.height * k;
        const p = corner(e.x, e.y, h);
        page.drawImage(img, { x: p.x, y: p.y, width: w, height: h, rotate: degrees(p.rotate) });
      } else {
        let font = fonts.get(e.font);
        if (!font) {
          font = await doc.embedFont(fontName(lib, e.font));
          fonts.set(e.font, font);
        }
        const p = displayedToUserSpace(page, e.x, 1 - e.y - (e.size * BASELINE) / dh);
        const [r, g, b] = hex(e.color);
        page.drawText(e.text, { x: p.x, y: p.y, size: e.size, font, color: rgb(r, g, b), rotate: degrees(p.rotate) });
      }
    } else if (e.kind === 'cover' || e.kind === 'highlight') {
      const p = displayedToUserSpace(page, e.x, 1 - e.y - e.height);
      const [r, g, b] = hex(e.color);
      page.drawRectangle({
        x: p.x,
        y: p.y,
        width: e.width * dw,
        height: e.height * dh,
        rotate: degrees(p.rotate),
        color: rgb(r, g, b),
        opacity: e.kind === 'highlight' ? 0.35 : 1,
        borderWidth: 0,
      });
    } else if (e.kind === 'draw') {
      const [r, g, b] = hex(e.color);
      const at = (pt: [number, number]) => {
        const p = displayedToUserSpace(page, pt[0], 1 - pt[1]);
        return { x: p.x, y: p.y };
      };
      const pts = e.points.map(at);
      // A tap is a dot: a zero-length line with a round cap.
      if (pts.length === 1) pts.push({ x: pts[0]!.x + 0.01, y: pts[0]!.y });
      for (let k = 0; k < pts.length - 1; k++) {
        page.drawLine({ start: pts[k]!, end: pts[k + 1]!, thickness: e.thickness, color: rgb(r, g, b), lineCap: LineCapStyle.Round });
      }
    } else if (e.kind === 'image') {
      const img = await image(e.png);
      const p = displayedToUserSpace(page, e.x, 1 - e.y - e.height);
      page.drawImage(img, { x: p.x, y: p.y, width: e.width * dw, height: e.height * dh, rotate: degrees(p.rotate) });
    }
    onProgress?.(i + 1, edits.length);
  }

  const turned = (src: number, page: PdfLib.PDFPage) => degrees((((page.getRotation().angle + (layout.turn[src] ?? 0)) % 360) + 360) % 360);
  if (layout.order.length === pages.length && layout.order.every((p, i) => p === i)) {
    pages.forEach((page, i) => page.setRotation(turned(i, page)));
    return doc.save({ useObjectStreams: true });
  }
  const out = await lib.PDFDocument.create();
  const copies = await out.copyPages(doc, layout.order);
  copies.forEach((copy, i) => {
    const src = layout.order[i]!;
    copy.setRotation(turned(src, pages[src]!));
    out.addPage(copy);
  });
  return out.save({ useObjectStreams: true });
}
