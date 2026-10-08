/**
 * Text extraction from a PDF with pdf.js, rebuilt into lines and paragraphs.
 * pdf.js hands back positioned text runs; this groups them into lines by
 * baseline, orders them, joins runs with spaces where there is a gap, and
 * then joins lines into paragraphs using vertical spacing, line length and
 * font size. Headings are lines noticeably larger than the body text.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getTextContent } from './pdf';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

export interface Paragraph {
  text: string;
  /** 0 = body, 1 = main heading, 2 = subheading. */
  level: 0 | 1 | 2;
}

export interface PageText {
  page: number;
  paragraphs: Paragraph[];
}

interface Run {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

interface Line {
  text: string;
  x0: number;
  x1: number;
  y: number;
  size: number;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};

/** Group runs into lines: same baseline (within a fraction of the font size), left to right. */
function toLines(runs: Run[]): Line[] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { runs: Run[]; y: number; size: number }[] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - r.y) <= Math.max(2, last.size * 0.4)) {
      last.runs.push(r);
    } else {
      lines.push({ runs: [r], y: r.y, size: r.size });
    }
  }
  return lines.map((l) => {
    const rs = l.runs.sort((a, b) => a.x - b.x);
    let text = '';
    let cursor = 0;
    for (const r of rs) {
      const gap = r.x - cursor;
      const needsSpace = text.length > 0 && !text.endsWith(' ') && !r.text.startsWith(' ') && gap > r.size * 0.15;
      text += (needsSpace ? ' ' : '') + r.text;
      cursor = r.x + r.width;
    }
    const size = median(rs.map((r) => r.size));
    return { text: text.replace(/\s+/g, ' ').trim(), x0: rs[0]!.x, x1: cursor, y: l.y, size };
  }).filter((l) => l.text.length > 0);
}

/** Join lines into paragraphs. `body` is the document's body font size. */
function toParagraphs(lines: Line[], body: number): Paragraph[] {
  if (lines.length === 0) return [];
  const widest = Math.max(...lines.map((l) => l.x1 - l.x0));
  const paras: Paragraph[] = [];
  let current: Line[] = [];

  const flush = () => {
    if (current.length === 0) return;
    let text = '';
    for (const l of current) {
      if (text.endsWith('-') && /^[a-z]/.test(l.text)) text = text.slice(0, -1) + l.text;
      else text += (text ? ' ' : '') + l.text;
    }
    const size = median(current.map((l) => l.size));
    const level: Paragraph['level'] = size >= body * 1.5 ? 1 : size >= body * 1.18 ? 2 : 0;
    paras.push({ text, level });
    current = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const prev = current[current.length - 1];
    if (prev) {
      const gap = prev.y - l.y;
      const sizeChanged = Math.abs(l.size - prev.size) > prev.size * 0.15;
      const prevShort = prev.x1 - prev.x0 < widest * 0.7 && /[.!?:;"”’)]$/.test(prev.text);
      const bigGap = gap > Math.max(prev.size, l.size) * 1.7;
      const isHeading = prev.size >= body * 1.18 || l.size >= body * 1.18;
      if (bigGap || sizeChanged || prevShort || (isHeading && Math.abs(l.size - prev.size) > 0.5)) flush();
    }
    current.push(l);
  }
  flush();
  return paras;
}

async function pageLines(doc: PDFDocumentProxy, pageNumber: number): Promise<Line[]> {
  const page = await doc.getPage(pageNumber);
  const content = await getTextContent(page);
  const runs: Run[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const t = item as TextItem;
    if (!t.str || t.str.trim() === '') continue;
    const [a, b, , , x, y] = t.transform as [number, number, number, number, number, number];
    const size = Math.hypot(a, b) || t.height || 10;
    runs.push({ text: t.str, x, y, width: t.width, size });
  }
  page.cleanup();
  return toLines(runs);
}

/**
 * Extract the text of every page. The body font size is measured across the
 * whole document (weighted by characters) so a short page with one heading
 * does not decide its own baseline. Pages without a text layer come back empty.
 */
export async function extractDocumentText(doc: PDFDocumentProxy, onPage?: (page: number, total: number) => void): Promise<PageText[]> {
  const all: Line[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    onPage?.(p, doc.numPages);
    all.push(await pageLines(doc, p));
  }
  const weighted: number[] = [];
  for (const lines of all) for (const l of lines) for (let i = 0; i < Math.min(l.text.length, 200); i += 10) weighted.push(l.size);
  const body = median(weighted) || 10;
  return all.map((lines, i) => ({ page: i + 1, paragraphs: toParagraphs(lines, body) }));
}

export function toPlainText(pages: PageText[], pageBreaks: boolean): string {
  const blocks = pages.map((p) => p.paragraphs.map((q) => q.text).join('\n\n'));
  return blocks.filter((b) => b.length > 0).join(pageBreaks ? '\n\n\f\n\n' : '\n\n') + '\n';
}
