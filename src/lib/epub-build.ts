/**
 * Turning the paragraphs recovered from a PDF (src/lib/pdftext.ts) into a
 * reflowable EPUB 3 book: running headers, footers and page numbers are
 * dropped, paragraphs split by a page break are joined again, the text is
 * cut into chapters at its headings, and the whole is zipped with fflate in
 * the layout the EPUB specification requires.
 */
import { zipSync, strToU8 } from 'fflate';
import type { PageText, Paragraph } from './pdftext';

export interface FlowParagraph extends Paragraph {
  /** The PDF page it starts on (1-based). */
  page: number;
}

/** A line's text with its numbers masked, so "Chapter 3 · 41" and "Chapter 3 · 42" count as the same header. */
const shape = (t: string) => t.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
const PAGE_NUMBER = /^(page\s+)?(\d+|[ivxlcdm]+)(\s+(of|\/)\s+\d+)?$/i;

/**
 * Drop page furniture and join paragraphs a page break cut in two. Running
 * headers and footers are text that sits first or last on many pages and is
 * the same apart from its numbers.
 */
export function flowText(pages: PageText[]): FlowParagraph[] {
  const edges = new Map<string, number>();
  for (const p of pages) {
    const ends = new Set([...p.paragraphs.slice(0, 2), ...p.paragraphs.slice(-2)].map((q) => shape(q.text)));
    for (const s of ends) edges.set(s, (edges.get(s) ?? 0) + 1);
  }
  const repeats = Math.max(3, pages.length * 0.3);
  const out: FlowParagraph[] = [];
  for (const p of pages) {
    const n = p.paragraphs.length;
    const kept = p.paragraphs.filter((q, i) => {
      const edge = i < 2 || i >= n - 2;
      if (!edge) return true;
      if (PAGE_NUMBER.test(q.text.trim())) return false;
      // Headers and footers are short; a long paragraph is text even if it repeats.
      if (q.text.length > 100) return true;
      return (edges.get(shape(q.text)) ?? 0) < repeats;
    });
    for (const [i, q] of kept.entries()) {
      const prev = out[out.length - 1];
      // The first paragraph of a page continues the last one when that stopped mid-sentence.
      if (i === 0 && prev && prev.level === 0 && q.level === 0 && !/[.!?:"”’)\]]$/.test(prev.text) && /^[a-z(“"'‘]/.test(q.text)) {
        prev.text = prev.text.endsWith('-') ? prev.text.slice(0, -1) + q.text : `${prev.text} ${q.text}`;
        continue;
      }
      out.push({ ...q, page: p.page });
    }
  }
  // Justified PDFs often stretch the space after a hyphen, which reads back as "street- stalls".
  for (const q of out) q.text = q.text.replace(/(\p{L})- (?!(and|or|nor|to)\b)(?=\p{L})/gu, '$1-');
  return out;
}

export interface Chapter {
  title: string;
  paragraphs: FlowParagraph[];
}

/**
 * Chapters start at main headings, or at subheadings when there are fewer
 * than two main headings. Text before the first becomes an opening section.
 * A document without headings is cut every `pagesPerPart` pages so no single
 * file is huge for an e-reader.
 */
export function toChapters(paras: FlowParagraph[], pagesPerPart = 20): Chapter[] {
  const count = (l: number) => paras.filter((p) => p.level === l).length;
  const level = count(1) >= 2 ? 1 : count(2) >= 2 ? 2 : count(1) === 1 ? 1 : 0;
  const chapters: Chapter[] = [];
  if (level) {
    for (const p of paras) {
      if (p.level === level || !chapters.length) chapters.push({ title: p.level === level ? p.text : 'Opening', paragraphs: [] });
      chapters[chapters.length - 1]!.paragraphs.push(p);
    }
    return chapters.filter((c) => c.paragraphs.length);
  }
  for (const p of paras) {
    const part = Math.floor((p.page - 1) / pagesPerPart);
    const title = `Pages ${part * pagesPerPart + 1} to ${(part + 1) * pagesPerPart}`;
    if (chapters.at(-1)?.title !== title) chapters.push({ title, paragraphs: [] });
    chapters.at(-1)!.paragraphs.push(p);
  }
  // The last part ends at the last page, not a round number.
  const last = chapters.at(-1);
  if (last) last.title = last.title.replace(/to \d+$/, `to ${paras.at(-1)!.page}`);
  return chapters;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** XML 1.0 forbids most control characters, which some PDFs carry in their text. */
const xmlSafe = (s: string) => esc(s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, ''));

export interface EpubMeta {
  title: string;
  author: string;
  language: string;
  /** A stable identifier for the book. */
  id: string;
  /** ISO time of creation, for dcterms:modified. */
  modified: string;
}

const CSS = `body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1 { font-size: 1.6em; margin: 1.5em 0 1em; line-height: 1.2; }
h2 { font-size: 1.25em; margin: 1.2em 0 0.6em; line-height: 1.25; }
p { margin: 0 0 0.8em; text-align: justify; }
`;

function page(title: string, body: string, lang: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head><meta charset="utf-8"/><title>${xmlSafe(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>
`;
}

export function buildEpub(chapters: Chapter[], meta: EpubMeta): Uint8Array {
  const lang = meta.language || 'en';
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    // The mimetype must be the first file and stored uncompressed.
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n',
    ),
    'OEBPS/style.css': strToU8(CSS),
  };
  const names = chapters.map((_, i) => `chapter-${String(i + 1).padStart(3, '0')}.xhtml`);
  chapters.forEach((c, i) => {
    const body = c.paragraphs
      .map((p) => (p.level === 0 ? `<p>${xmlSafe(p.text)}</p>` : p.text === c.title && p === c.paragraphs[0] ? `<h1>${xmlSafe(p.text)}</h1>` : `<h2>${xmlSafe(p.text)}</h2>`))
      .join('\n');
    files[`OEBPS/${names[i]}`] = strToU8(page(c.title, body, lang));
  });
  const nav = `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>\n${chapters.map((c, i) => `<li><a href="${names[i]}">${xmlSafe(c.title)}</a></li>`).join('\n')}\n</ol></nav>`;
  files['OEBPS/nav.xhtml'] = strToU8(page('Contents', nav, lang));
  // An NCX table of contents too, for older readers that do not read the EPUB 3 nav.
  files['OEBPS/toc.ncx'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${esc(meta.id)}"/></head><docTitle><text>${xmlSafe(meta.title)}</text></docTitle><navMap>
${chapters.map((c, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${xmlSafe(c.title)}</text></navLabel><content src="${names[i]}"/></navPoint>`).join('\n')}
</navMap></ncx>
`);
  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${esc(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${esc(meta.id)}</dc:identifier>
<dc:title>${xmlSafe(meta.title)}</dc:title>
${meta.author ? `<dc:creator>${xmlSafe(meta.author)}</dc:creator>\n` : ''}<dc:language>${esc(lang)}</dc:language>
<meta property="dcterms:modified">${esc(meta.modified)}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${names.map((n, i) => `<item id="c${i + 1}" href="${n}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine toc="ncx">
${names.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n')}
</spine>
</package>
`);
  return zipSync(files as Parameters<typeof zipSync>[0]);
}
