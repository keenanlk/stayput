import { createShell, processEach, str } from '../lib/shell';
import { closePdfJs, openWithPdfJs } from '../lib/pdf';
import { extractDocumentText } from '../lib/pdftext';
import { buildEpub, flowText, toChapters } from '../lib/epub-build';
import { baseName, type OutputFile } from '../lib/files';

/**
 * PDF to EPUB: the PDF's text is read with pdf.js and rebuilt into
 * paragraphs and headings (src/lib/pdftext.ts, shared with PDF to Word),
 * then written as a reflowable EPUB (src/lib/epub-build.ts). Nothing is uploaded.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

createShell({
  async process(files, progress) {
    const language = str('language', 'en');
    return processEach(files, progress, 'Converting', async (entry, i) => {
      const doc = await openWithPdfJs(new Uint8Array(await entry.file.arrayBuffer()));
      try {
        const pages = await extractDocumentText(doc, (p, total) => progress.set(`${entry.file.name}: reading page ${p} of ${total}`, (i + (p - 1) / total) / files.length));
        const paras = flowText(pages);
        if (paras.length === 0) {
          throw new Error('This PDF has no text layer, so there is no text to put in a book. It is probably a scan: run it through OCR PDF first, then convert the searchable copy.');
        }
        const chapters = toChapters(paras);
        const info = (await doc.getMetadata().catch(() => undefined))?.info as { Title?: string; Author?: string } | undefined;
        const title = info?.Title?.trim() || baseName(entry.file.name);
        const bytes = buildEpub(chapters, {
          title,
          author: info?.Author?.trim() ?? '',
          language,
          id: `urn:uuid:${crypto.randomUUID()}`,
          modified: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        });
        const words = paras.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
        const out: OutputFile = {
          name: `${baseName(entry.file.name)}.epub`,
          blob: new Blob([bytes as BlobPart], { type: 'application/epub+zip' }),
          originalSize: entry.file.size,
          note: `${plural(words, 'word')} in ${plural(chapters.length, 'chapter')} from ${plural(doc.numPages, 'page')}`,
        };
        return out;
      } finally {
        await closePdfJs(doc);
      }
    });
  },
  resultsTitle: () => 'Converted',
});
