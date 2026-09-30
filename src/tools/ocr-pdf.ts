import { bool, createShell, processEach, radio } from '../lib/shell';
import { ocrPdf } from '../lib/ocr-pdf';
import { suffixName, type OutputFile } from '../lib/files';

/**
 * OCR a scanned PDF into a searchable one (src/lib/ocr-pdf.ts). Tesseract
 * and its English model are served from this site; nothing is uploaded.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

createShell({
  async process(files, progress) {
    const redo = radio('pages', 'scans') === 'all';
    const saveText = bool('save-text');
    return processEach(files, progress, 'Reading', async (entry, i) => {
      const r = await ocrPdf(new Uint8Array(await entry.file.arrayBuffer()), { redo }, (message, f) =>
        progress.set(`${entry.file.name}: ${message}`, (i + f) / files.length),
      );
      if (r.read === 0) throw new Error(`All ${plural(r.pages, 'page')} already have text you can search and select, so there was nothing to read. Choose Every page to read them again.`);
      const note = [
        `${plural(r.words, 'word')} found on ${plural(r.read, 'page')}`,
        r.skipped ? `${plural(r.skipped, 'page')} already had text and ${r.skipped === 1 ? 'was' : 'were'} left as ${r.skipped === 1 ? 'it was' : 'they were'}` : '',
        r.words ? `${Math.round(r.confidence)}% average confidence` : 'no text could be read',
      ].filter(Boolean).join('; ');
      const pdf: OutputFile = {
        name: suffixName(entry.file.name, '-searchable', 'pdf'),
        blob: new Blob([r.bytes as BlobPart], { type: 'application/pdf' }),
        originalSize: entry.file.size,
        note,
      };
      if (!saveText || !r.text) return pdf;
      return [
        pdf,
        {
          name: suffixName(entry.file.name, '', 'txt'),
          blob: new Blob([r.text], { type: 'text/plain;charset=utf-8' }),
          originalSize: entry.file.size,
          note: 'The recognised text, page by page',
          text: r.text,
        },
      ];
    });
  },
  resultsTitle: () => 'Searchable PDF',
});
