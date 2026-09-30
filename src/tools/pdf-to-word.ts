import { createShell, bool, str } from '../lib/shell';
import { closePdfJs, openWithPdfJs } from '../lib/pdf';
import { extractDocumentText, toPlainText } from '../lib/pdftext';
import { buildDocx } from '../lib/docx';
import { baseName, type OutputFile } from '../lib/files';

const info = document.getElementById('page-info')!;
const preview = document.getElementById('text-preview')!;

createShell({
  async onFilesChanged(files) {
    info.textContent = '';
    preview.hidden = true;
    preview.textContent = '';
    const f = files[0];
    if (!f) return;
    try {
      const doc = await openWithPdfJs(new Uint8Array(await f.file.arrayBuffer()));
      info.textContent = `${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
      await closePdfJs(doc);
    } catch (e) {
      info.textContent = e instanceof Error ? e.message : String(e);
    }
  },
  async process(files, progress) {
    const entry = files[0]!;
    const format = str('format', 'docx');
    const pageBreaks = bool('page-breaks');
    const doc = await openWithPdfJs(new Uint8Array(await entry.file.arrayBuffer()));
    try {
      const pages = await extractDocumentText(doc, (p, total) => progress.set(`Reading page ${p} of ${total}`, (p - 1) / total));
      const paragraphs = pages.reduce((n, p) => n + p.paragraphs.length, 0);
      const words = pages.reduce((n, p) => n + p.paragraphs.reduce((m, q) => m + q.text.split(/\s+/).length, 0), 0);
      if (paragraphs === 0) {
        throw new Error('This PDF has no text layer, so there is nothing to extract. It is probably a scan: each page is a picture of text. Run it through OCR PDF first to add a text layer, then convert the searchable copy.');
      }
      const text = toPlainText(pages, pageBreaks);
      preview.textContent = text.slice(0, 1200) + (text.length > 1200 ? '\n…' : '');
      preview.hidden = false;
      const base = baseName(entry.file.name);
      const note = `${words} words, ${paragraphs} paragraphs from ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
      const outs: OutputFile[] = [];
      if (format === 'txt') {
        outs.push({ name: `${base}.txt`, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), note });
      } else {
        const bytes = buildDocx(pages, { title: base, pageBreaks });
        outs.push({ name: `${base}.docx`, blob: new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), note });
      }
      progress.set('Done', 1);
      return outs;
    } finally {
      await closePdfJs(doc);
    }
  },
  resultsTitle: () => 'Document ready',
});
