import { createShell } from '../lib/shell';
import { closePdfJs, mergePdfs, openWithPdfJs, pageThumbnail } from '../lib/pdf';
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
    for (const f of files) sources.push(new Uint8Array(await f.file.arrayBuffer()));
    const bytes = await mergePdfs(sources, (done) => progress.set(`Merging file ${done} of ${files.length}`, done / files.length));
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
