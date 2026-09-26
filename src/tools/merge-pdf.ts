import { createShell, describeError } from '../lib/shell';
import { closePdfJs, loadDocument, mergePdfs, openWithPdfJs, pageThumbnail } from '../lib/pdf';
import type { OutputFile } from '../lib/files';

createShell({
  async thumbnail(file) {
    const doc = await openWithPdfJs(new Uint8Array(await file.arrayBuffer()));
    const url = await pageThumbnail(doc, 1, 88);
    await closePdfJs(doc);
    return url;
  },
  async process(files, progress) {
    if (files.length < 2) throw new Error('Add at least two PDF files to merge.');
    const sources: Uint8Array[] = [];
    for (const [i, f] of files.entries()) {
      progress.set(`Reading ${f.file.name} (${i + 1} of ${files.length})`, (i / files.length) * 0.3);
      const src = new Uint8Array(await f.file.arrayBuffer());
      // Validate each file up front so the error names the file at fault.
      try {
        await loadDocument(src);
      } catch (e) {
        throw new Error(describeError(f.file, e));
      }
      sources.push(src);
    }
    const bytes = await mergePdfs(sources, (done) => progress.set(`Merging file ${done} of ${files.length}`, 0.3 + (0.7 * done) / files.length));
    const out: OutputFile = {
      name: 'merged.pdf',
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      originalSize: files.reduce((n, f) => n + f.file.size, 0),
      note: `${files.length} files combined`,
    };
    return [out];
  },
  resultsTitle: () => 'Merged',
});
