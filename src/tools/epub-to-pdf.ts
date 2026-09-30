import { bool, createShell, processEach, radio, str } from '../lib/shell';
import { openEpub } from '../lib/epub';
import { epubToPdf, type PaperSize, type TypeSize } from '../lib/epub-pdf';
import { suffixName, type OutputFile } from '../lib/files';

/**
 * EPUB to PDF: the book is unzipped and read in the tab (src/lib/epub.ts),
 * laid out with pdfmake in a worker (src/lib/epub-pdf.ts). Nothing is uploaded.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

createShell({
  async process(files, progress) {
    const paper = str('paper', 'a5') as PaperSize;
    const type = radio('type-size', 'medium') as TypeSize;
    const contents = bool('contents');
    return processEach(files, progress, 'Converting', async (entry, i) => {
      const at = (f: number) => (i + f) / files.length;
      progress.set(`${entry.file.name}: opening the book`, at(0));
      const book = openEpub(new Uint8Array(await entry.file.arrayBuffer()));
      const r = await epubToPdf(book, { paper, type, contents }, (message, f) => progress.set(`${entry.file.name}: ${message.toLowerCase()}`, at(f)));
      // pdfkit writes each page as its own uncompressed object, so they can be counted directly.
      const pages = (new TextDecoder('latin1').decode(r.bytes).match(/\/Type \/Page\b(?!s)/g) ?? []).length;
      const note = [
        `${plural(pages, 'page')} from ${plural(r.chapters, 'chapter')}`,
        r.images ? plural(r.images, 'picture') : '',
        r.missing ? `${plural(r.missing, 'character')} in scripts the font cannot show were left out` : '',
      ].filter(Boolean).join(', ');
      const out: OutputFile = {
        name: suffixName(entry.file.name, '', 'pdf'),
        blob: new Blob([r.bytes as BlobPart], { type: 'application/pdf' }),
        originalSize: entry.file.size,
        note,
      };
      return out;
    });
  },
  resultsTitle: () => 'Converted',
});
