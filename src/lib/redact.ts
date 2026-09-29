/**
 * True redaction for PDFs. Drawing a black rectangle over text (what most
 * editors and "redact" sites do on a free tier) leaves the text underneath,
 * where copy and paste, search or any text extractor still reads it. Here
 * every page with a redaction is rendered to an image by pdf.js, the boxes are
 * painted on the pixels, and the page's content is replaced by that image: the
 * text, fonts, links, annotations and form values on that page are gone.
 * Pages without redactions are left exactly as they were.
 *
 * Afterwards the document's metadata and every object nothing refers to any
 * more (the old page content included) are deleted by `removePdfMetadata`, so
 * the removed text is not left behind as an orphan in the file either.
 */
import type * as PdfLib from 'pdf-lib';
import type * as PdfJs from 'pdfjs-dist';
import { canvasToBlob } from './image';
import { loadDocument, loadPdfLib, renderPage } from './pdf';
import { removePdfMetadata } from './pdf-meta';

export interface RedactBox {
  /** Zero-based page index. */
  page: number;
  /** Fractions 0..1 of the page as displayed (after rotation and crop), origin top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Resolution redacted pages are rendered at. 200 dpi keeps small print legible. */
const DPI = 200;
/** Cap on the longer side so a poster-sized page does not exhaust memory. */
const MAX_PX = 5000;

/** Render a page with its boxes painted black, as JPEG bytes plus its displayed size in points. */
async function redactedImage(pdf: PdfJs.PDFDocumentProxy, index: number, boxes: RedactBox[]) {
  const first = await pdf.getPage(index + 1);
  const base = first.getViewport({ scale: 1 });
  const scale = Math.min(DPI / 72, MAX_PX / Math.max(base.width, base.height));
  const { canvas, widthPt, heightPt } = await renderPage(pdf, index + 1, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  for (const b of boxes) {
    // Round outwards so a box never leaves a sliver of the pixel row it touches.
    const x0 = Math.floor(b.x * canvas.width);
    const y0 = Math.floor(b.y * canvas.height);
    const x1 = Math.ceil((b.x + b.width) * canvas.width);
    const y1 = Math.ceil((b.y + b.height) * canvas.height);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
  canvas.width = canvas.height = 0;
  return { jpg: new Uint8Array(await blob.arrayBuffer()), widthPt, heightPt };
}

/** Remove form fields whose widgets sat on a redacted page, so their values go too. */
function dropFields(lib: typeof PdfLib, doc: PdfLib.PDFDocument, widgets: Set<PdfLib.PDFRef>) {
  if (!widgets.size) return;
  const acro = doc.catalog.lookupMaybe(lib.PDFName.of('AcroForm'), lib.PDFDict);
  const fields = acro?.lookupMaybe(lib.PDFName.of('Fields'), lib.PDFArray);
  if (!acro || !fields) return;
  const Kids = lib.PDFName.of('Kids');
  // Returns true when the field (or all of its children) should go.
  const prune = (arr: PdfLib.PDFArray): void => {
    for (let i = arr.size() - 1; i >= 0; i--) {
      const ref = arr.get(i);
      const node = ref instanceof lib.PDFRef ? doc.context.lookup(ref) : ref;
      if (ref instanceof lib.PDFRef && widgets.has(ref)) {
        arr.remove(i);
        continue;
      }
      if (node instanceof lib.PDFDict) {
        const kids = node.lookupMaybe(Kids, lib.PDFArray);
        if (kids) {
          prune(kids);
          if (kids.size() === 0) arr.remove(i);
        }
      }
    }
  };
  prune(fields);
}

/**
 * Apply the boxes. `pdf` is the same document opened with pdf.js (for
 * rendering); `source` its bytes. Returns the redacted PDF.
 */
export async function redactPdf(
  source: Uint8Array,
  pdf: PdfJs.PDFDocumentProxy,
  boxes: RedactBox[],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const lib = await loadPdfLib();
  const doc = await loadDocument(source);
  const pages = doc.getPages();
  const byPage = new Map<number, RedactBox[]>();
  for (const b of boxes) if (pages[b.page]) byPage.set(b.page, [...(byPage.get(b.page) ?? []), b]);
  const N = lib.PDFName.of.bind(lib.PDFName);
  const widgets = new Set<PdfLib.PDFRef>();
  let done = 0;
  for (const [index, list] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const { jpg, widthPt, heightPt } = await redactedImage(pdf, index, list);
    const page = pages[index]!;
    const node = page.node;
    const annots = node.lookupMaybe(N('Annots'), lib.PDFArray);
    if (annots) for (let i = 0; i < annots.size(); i++) {
      const a = annots.get(i);
      if (a instanceof lib.PDFRef) widgets.add(a);
    }
    // Replace the page: no rotation, a plain box the size it was displayed at,
    // fresh resources and contents holding only the image.
    for (const key of ['Annots', 'CropBox', 'TrimBox', 'BleedBox', 'ArtBox', 'Thumb', 'PieceInfo', 'Metadata', 'StructParents', 'Group', 'AA', 'B']) node.delete(N(key));
    node.set(N('Rotate'), lib.PDFNumber.of(0));
    node.set(N('MediaBox'), doc.context.obj([0, 0, widthPt, heightPt]));
    node.set(N('Resources'), doc.context.obj({ Font: {}, XObject: {}, ExtGState: {} }));
    node.set(N('Contents'), doc.context.obj([]));
    const img = await doc.embedJpg(jpg);
    page.drawImage(img, { x: 0, y: 0, width: widthPt, height: heightPt });
    onProgress?.(++done, byPage.size);
  }
  dropFields(lib, doc, widgets);
  if (byPage.size) {
    // The structure tree (tagged PDF) can repeat page text as ActualText and Alt,
    // and points into the replaced content, so it goes.
    doc.catalog.delete(N('StructTreeRoot'));
    doc.catalog.delete(N('MarkInfo'));
  }
  const saved = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  return (await removePdfMetadata(saved)).bytes;
}

/* ------------------------------------------------------------------ */
/* Finding text                                                        */
/* ------------------------------------------------------------------ */

export type Pattern = 'email' | 'phone' | 'number';

const PATTERNS: Record<Pattern, RegExp> = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // 7+ digits with the usual separators: phone numbers in most formats.
  phone: /\+?\(?\d[\d ().-]{5,}\d/g,
  // Long digit runs: account, card, IBAN tails, ID and reference numbers.
  number: /\b(?:[A-Z]{2}\d{2}[ ]?)?\d(?:[ -]?\d){5,}\b/g,
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A regular expression for a search: literal text (case-insensitive), or a named pattern. */
export function matcher(query: string | Pattern): RegExp {
  if (query in PATTERNS) return new RegExp(PATTERNS[query as Pattern].source, 'g');
  return new RegExp(escapeRe(query.trim()).replace(/\s+/g, '\\s+'), 'gi');
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Width of `s` in a generic font of the same family, used to place a match within its line. */
function textWidth(s: string, family: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return s.length;
  measureCtx.font = `100px ${family}`;
  return measureCtx.measureText(s).width;
}

/**
 * Boxes covering every match of `re` in a page's text. Positions come from
 * pdf.js's text layer; a match's place within its run of text is estimated
 * from character widths, and the box is padded to allow for the font.
 */
export async function findOnPage(pdf: PdfJs.PDFDocumentProxy, index: number, re: RegExp): Promise<RedactBox[]> {
  const page = await pdf.getPage(index + 1);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const out: RedactBox[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue;
    const [a, b, c, d, e, f] = item.transform as number[];
    const run = Math.hypot(a!, b!) || 1;
    const size = Math.hypot(c!, d!) || run;
    // Unit vectors along and up the text line, in user space.
    const ux = a! / run, uy = b! / run;
    const vx = c! / size, vy = d! / size;
    const family = content.styles[item.fontName]?.fontFamily || 'sans-serif';
    const width = (t: string) => textWidth(t, family);
    const full = width(item.str) || 1;
    re.lastIndex = 0;
    for (let m = re.exec(item.str); m; m = re.exec(item.str)) {
      if (!m[0]) {
        re.lastIndex++;
        continue;
      }
      const t0 = (width(item.str.slice(0, m.index)) / full) * item.width;
      const t1 = (width(item.str.slice(0, m.index + m[0].length)) / full) * item.width;
      const pad = size * 0.15;
      const corners: [number, number][] = [];
      for (const t of [t0 - pad, t1 + pad]) {
        for (const h of [-size * 0.3, size * 1.0]) corners.push([e! + ux * t + vx * h, f! + uy * t + vy * h]);
      }
      const m6 = vp.transform as number[];
      const pts = corners.map(([x, y]) => [m6[0]! * x + m6[2]! * y + m6[4]!, m6[1]! * x + m6[3]! * y + m6[5]!]);
      const xs = pts.map((p) => p[0]!);
      const ys = pts.map((p) => p[1]!);
      const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(vp.width, Math.max(...xs));
      const y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(vp.height, Math.max(...ys));
      if (x1 > x0 && y1 > y0) out.push({ page: index, x: x0 / vp.width, y: y0 / vp.height, width: (x1 - x0) / vp.width, height: (y1 - y0) / vp.height });
    }
  }
  page.cleanup();
  return out;
}
