/**
 * Lay out an EPUB book as a PDF. Each chapter's XHTML is walked into
 * pdfmake's document format (headings, paragraphs with bold and italic,
 * lists, quotes, pictures), and pdfmake (MIT) breaks it into lines and pages
 * with the Roboto font in a background worker, so the tab stays responsive.
 */
import type { EpubBook } from './epub';
import { resolvePath } from './epub';

export type PaperSize = 'a5' | 'a4' | 'letter';
export type TypeSize = 'small' | 'medium' | 'large';

export interface EpubPdfOptions {
  paper: PaperSize;
  type: TypeSize;
  contents: boolean;
}

/** pdfmake's document nodes, loosely typed: they are plain data sent to the worker. */
type Run = string | { text: string | Run[]; bold?: boolean; italics?: boolean; sup?: boolean; sub?: boolean; fontSize?: number; font?: string; decoration?: string };
type Node = Record<string, unknown>;

const FONT_SIZE: Record<TypeSize, number> = { small: 10, medium: 11.5, large: 14 };
const PAPER: Record<PaperSize, { size: string; margin: number }> = {
  a5: { size: 'A5', margin: 50 },
  a4: { size: 'A4', margin: 72 },
  letter: { size: 'LETTER', margin: 72 },
};
const HEADING: Record<string, number> = { h1: 1.8, h2: 1.5, h3: 1.25, h4: 1.1, h5: 1, h6: 1 };

const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'main', 'nav', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'pre', 'figure', 'figcaption', 'hr', 'body', 'dl', 'dt', 'dd', 'center', 'address', 'caption', 'thead', 'tbody', 'tfoot']);
const SKIP = new Set(['script', 'style', 'head', 'title', 'noscript', 'template', 'math']);

/** Characters Roboto has no letters for: Hebrew, Arabic, Indic, Thai, Tibetan, Hangul and CJK. */
const UNSUPPORTED = /[֐-ࣿऀ-෿฀-࿿ᄀ-ᇿ぀-鿿가-힯豈-﫿]/g;

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A data URL pdfmake can embed: JPEG and PNG as they are, anything else (GIF, WebP, SVG) redrawn as PNG. */
async function imageUrl(bytes: Uint8Array, path: string): Promise<{ url: string; width: number; height: number } | undefined> {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const type = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : /\.svg$/i.test(path) ? 'image/svg+xml' : '';
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], type ? { type } : {}));
    const { width, height } = bitmap;
    if (isJpeg || isPng) {
      bitmap.close();
      return { url: `data:${type};base64,${base64(bytes)}`, width, height };
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { url: canvas.toDataURL('image/png'), width, height };
  } catch {
    // SVGs without a size, or formats this browser cannot decode, are left out.
    return undefined;
  }
}

class Walker {
  nodes: Node[] = [];
  runs: Run[] = [];
  unsupported = 0;
  letters = 0;
  images = 0;

  constructor(private book: EpubBook, private path: string, private fs: number, private width: number, private height: number) {}

  flush(style: Node = {}) {
    // Trim the whitespace HTML would collapse at the start and end of a block.
    while (typeof this.runs[0] === 'string' && !(this.runs[0] as string).trim()) this.runs.shift();
    while (typeof this.runs.at(-1) === 'string' && !(this.runs.at(-1) as string).trim()) this.runs.pop();
    if (this.runs.length) {
      if (typeof this.runs[0] === 'string') this.runs[0] = (this.runs[0] as string).trimStart();
      this.nodes.push({ text: this.runs, margin: [0, 0, 0, this.fs * 0.55], ...style });
    }
    this.runs = [];
  }

  private count(s: string) {
    this.letters += s.replace(/\s/g, '').length;
    this.unsupported += s.match(UNSUPPORTED)?.length ?? 0;
  }

  private inline(el: Node & Element, fmt: { bold?: boolean; italics?: boolean; sup?: boolean; sub?: boolean; pre?: boolean }): void {
    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        let s = child.textContent ?? '';
        if (!fmt.pre) s = s.replace(/\s+/g, ' ');
        if (!s) continue;
        this.count(s);
        const clean = s.replace(UNSUPPORTED, '');
        this.runs.push(fmt.bold || fmt.italics || fmt.sup || fmt.sub ? { text: clean, bold: fmt.bold, italics: fmt.italics, sup: fmt.sup, sub: fmt.sub } : clean);
      } else if (child.nodeType === 1) {
        const c = child as Element;
        const tag = c.localName.toLowerCase();
        if (SKIP.has(tag)) continue;
        if (tag === 'br') this.runs.push('\n');
        else if (BLOCK.has(tag) || tag === 'img' || tag === 'svg' || tag === 'image') this.pending.push(c);
        else {
          this.inline(c as Node & Element, {
            ...fmt,
            bold: fmt.bold || ['b', 'strong', 'th'].includes(tag) || /bold/.test(c.getAttribute('style') ?? ''),
            italics: fmt.italics || ['i', 'em', 'cite', 'var', 'dfn'].includes(tag) || /italic/.test(c.getAttribute('style') ?? ''),
            sup: fmt.sup || tag === 'sup',
            sub: fmt.sub || tag === 'sub',
          });
          // Table cells become one line per row; keep the cells apart.
          if (tag === 'td' || tag === 'th') this.runs.push('   ');
        }
      }
    }
  }

  /** Block elements found inside inline content (a picture in a span, say); handled after the text around them. */
  private pending: Element[] = [];

  async block(el: Element, depth = 0): Promise<void> {
    const tag = el.localName.toLowerCase();
    if (SKIP.has(tag)) return;
    if (/^h[1-6]$/.test(tag)) {
      this.flush();
      this.inline(el as Node & Element, { bold: true });
      const before = this.nodes.length;
      this.flush({ fontSize: this.fs * HEADING[tag]!, bold: true, alignment: 'left', margin: [0, this.fs * (tag === 'h1' || tag === 'h2' ? 1.2 : 0.8), 0, this.fs * 0.6], keepWithNext: true });
      // Marked for epubToPdf, which decides which level starts chapters; removed before layout.
      if (this.nodes.length > before) this.nodes[before]!.level = Number(tag[1]);
      return this.drainPending(depth);
    }
    if (tag === 'img' || tag === 'image') return this.image(el);
    if (tag === 'svg') {
      for (const img of [...el.getElementsByTagName('*')].filter((e) => e.localName === 'image')) await this.image(img);
      return;
    }
    if (tag === 'hr') {
      this.flush();
      this.nodes.push({ text: '* * *', alignment: 'center', margin: [0, this.fs * 0.6, 0, this.fs * 1.1] });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      this.flush();
      const items: Node[] = [];
      for (const li of [...el.children].filter((c) => c.localName === 'li')) {
        const sub = new Walker(this.book, this.path, this.fs, this.width - 20, this.height);
        await sub.block(li, depth + 1);
        sub.flush();
        this.absorb(sub);
        items.push({ stack: sub.nodes.map((n) => ({ ...n, margin: [0, 0, 0, this.fs * 0.25] })) });
      }
      if (items.length) this.nodes.push({ [tag]: items, margin: [10, 0, 0, this.fs * 0.55] });
      return;
    }
    if (tag === 'blockquote') {
      this.flush();
      const sub = new Walker(this.book, this.path, this.fs, this.width - 40, this.height);
      await sub.children(el, depth + 1);
      sub.flush();
      this.absorb(sub);
      if (sub.nodes.length) this.nodes.push({ stack: sub.nodes, margin: [20, 0, 20, this.fs * 0.3], italics: true });
      return;
    }
    if (tag === 'pre') {
      this.flush();
      this.inline(el as Node & Element, { pre: true });
      this.flush({ preserveLeadingSpaces: true, fontSize: this.fs * 0.85, alignment: 'left' });
      return;
    }
    // Paragraph-like: its inline content becomes one paragraph, and nested blocks their own.
    await this.children(el, depth);
    const center = tag === 'center' || /text-align:\s*center/.test(el.getAttribute('style') ?? '');
    this.flush(tag === 'figcaption' || tag === 'caption' ? { alignment: 'center', fontSize: this.fs * 0.9, italics: true } : center ? { alignment: 'center' } : {});
  }

  async children(el: Element, depth: number): Promise<void> {
    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        this.inline({ childNodes: [child] } as unknown as Node & Element, {});
      } else if (child.nodeType === 1) {
        const c = child as Element;
        const tag = c.localName.toLowerCase();
        if (SKIP.has(tag)) continue;
        if (BLOCK.has(tag) || tag === 'img' || tag === 'svg' || tag === 'image') {
          this.flush();
          await this.block(c, depth + 1);
        } else if (tag === 'br') this.runs.push('\n');
        else this.inline({ childNodes: [c] } as unknown as Node & Element, {});
        await this.drainPending(depth);
      }
    }
  }

  private async drainPending(depth: number) {
    if (!this.pending.length) return;
    const found = this.pending;
    this.pending = [];
    this.flush();
    for (const el of found) await this.block(el, depth + 1);
  }

  private absorb(sub: Walker) {
    this.unsupported += sub.unsupported;
    this.letters += sub.letters;
    this.images += sub.images;
  }

  private async image(el: Element) {
    const src = el.getAttribute('src') ?? el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!src || /^(https?:|data:)/i.test(src)) return;
    const path = resolvePath(this.path, src);
    const bytes = this.book.files[path];
    if (!bytes) return;
    const img = await imageUrl(bytes, path);
    if (!img) return;
    this.flush();
    // Never enlarge a small picture (an ornament, a drop cap) past its own size at 150 dpi.
    const natural = [img.width * 0.48, img.height * 0.48];
    const fit = [Math.min(this.width, natural[0]!), Math.min(this.height * 0.92, natural[1]!)];
    this.nodes.push({ image: img.url, fit, alignment: 'center', margin: [0, this.fs * 0.4, 0, this.fs * 0.7] });
    this.images++;
  }
}

export interface EpubPdfResult {
  bytes: Uint8Array;
  chapters: number;
  images: number;
  /** Letters that could not be shown because the font has no shapes for their script. */
  missing: number;
}

export async function epubToPdf(book: EpubBook, opts: EpubPdfOptions, onProgress?: (message: string, f: number) => void): Promise<EpubPdfResult> {
  const fs = FONT_SIZE[opts.type];
  const paper = PAPER[opts.paper];
  const [pw, ph] = { a5: [419.53, 595.28], a4: [595.28, 841.89], letter: [612, 792] }[opts.paper];
  const width = pw! - paper.margin * 2;
  const height = ph! - paper.margin * 2 - 30;
  const content: Node[] = [];
  let letters = 0;
  let unsupported = 0;
  let images = 0;
  let chapters = 0;
  const bodies: Node[][] = [];
  for (const [i, chapter] of book.chapters.entries()) {
    onProgress?.(`Laying out chapter ${i + 1} of ${book.chapters.length}`, (i / book.chapters.length) * 0.4);
    // The book's own contents page only repeats the one made here.
    if (chapter.nav && opts.contents) continue;
    const body = chapter.doc.body ?? chapter.doc.getElementsByTagName('body')[0] ?? chapter.doc.documentElement;
    const w = new Walker(book, chapter.path, fs, width, height);
    await w.block(body);
    w.flush();
    letters += w.letters;
    unsupported += w.unsupported;
    images += w.images;
    if (w.nodes.length) bodies.push(w.nodes);
  }
  // Chapters are marked by the highest heading level the book uses more than once (a level used once is the book's title).
  const counts = [0, 0, 0, 0];
  for (const n of bodies.flat()) if (typeof n.level === 'number' && n.level <= 3) counts[n.level]!++;
  const chapterLevel = [1, 2, 3].find((l) => counts[l]! >= 2);
  let headings = 0;
  for (const nodes of bodies) {
    for (const [j, n] of nodes.entries()) {
      if (n.level === chapterLevel) {
        if (opts.contents) n.tocItem = true;
        headings++;
        // Several chapters in one file (as Project Gutenberg books have) still start on pages of their own.
        if (j > 0) n.pageBreak = 'before';
      }
      delete n.level;
    }
    if (content.length) nodes[0] = { ...nodes[0], pageBreak: 'before' };
    content.push(...nodes);
  }
  chapters = headings || bodies.length;
  if (!content.length) throw new Error('This book has no text or pictures to put on pages.');
  if (letters && unsupported / letters > 0.2) {
    throw new Error('This book is mostly in a script the PDF font cannot show yet (Chinese, Japanese, Korean, Arabic, Hebrew, Thai or an Indian script). Books in Latin, Greek and Cyrillic letters work.');
  }
  // A contents page is only worth it with a few chapter headings to list.
  if (opts.contents && headings >= 3) {
    const first = content.findIndex((n) => n.tocItem);
    content.splice(Math.max(0, first), 0, { toc: { title: { text: 'Contents', fontSize: fs * 1.5, bold: true, margin: [0, 0, 0, fs] } }, pageBreak: first > 0 ? 'before' : undefined });
    // The chapter after it already starts a new page; make sure it does even when it was the book's first.
    content[Math.max(0, first) + 1] = { ...content[Math.max(0, first) + 1], pageBreak: 'before' };
  }
  const def = {
    info: { title: book.title || undefined, author: book.author || undefined, creator: 'Stayput' },
    pageSize: paper.size,
    pageMargins: [paper.margin, paper.margin, paper.margin, paper.margin + 10],
    defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.3, alignment: 'justify' },
    content,
  };
  onProgress?.('Breaking the text into pages', 0.45);
  const bytes = await render(def, (f) => onProgress?.('Breaking the text into pages', 0.45 + f * 0.55));
  return { bytes, chapters, images, missing: unsupported };
}

function render(def: Node, onProgress: (f: number) => void): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdfmake.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ type: 'progress'; f: number } | { type: 'done'; bytes: Uint8Array } | { type: 'error'; message: string }>) => {
      const m = e.data;
      if (m.type === 'progress') return onProgress(m.f);
      worker.terminate();
      if (m.type === 'done') resolve(m.bytes);
      else reject(new Error(m.message));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'The PDF could not be made.'));
    };
    worker.postMessage(def);
  });
}
