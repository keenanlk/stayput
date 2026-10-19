import { createShell, radio } from '../lib/shell';
import { decodeImage } from '../lib/image';
import { baseName, type OutputFile } from '../lib/files';
import { readText, unwrap } from '../lib/ocr';
import { buildDocx } from '../lib/docx';
import type { PageText } from '../lib/pdftext';
import { UnreadableFile } from '../lib/input-error';
import { nameBare } from '../lib/bare-error';
import { rereadOnce } from '../lib/read-failure';

const preview = document.getElementById('text-preview')!;

createShell({
  autoDownloadSingle: true,
  resultsTitle: () => 'Document ready',
  async process(files, progress) {
    preview.hidden = true;
    preview.textContent = '';
    const join = radio('lines', 'keep') === 'join';
    const pages: PageText[] = [];
    const shown: string[] = [];
    for (const [index, entry] of files.entries()) {
      const share = (f: number) => (index + f) / files.length;
      const { bitmap } = await rereadOnce(() => decodeImage(entry.file)).catch((e) => {
        throw nameBare('ImageDecodeFailed', e);
      });
      try {
        const result = await readText(bitmap, (stage, f) =>
          stage === 'loading'
            ? progress.set(`Loading the text reader (one time, about 6 MB): ${Math.round(f * 100)}%`, share(0.05))
            : progress.set(`Reading the text in ${entry.file.name}…`, share(0.3)),
        );
        const text = join ? unwrap(result.text) : result.text;
        const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        pages.push({ page: index + 1, paragraphs: paragraphs.map((t) => ({ text: t, level: 0 })) });
        shown.push(`Image ${index + 1} (${entry.file.name})\n${paragraphs.length ? text.trim() : '(no clear text found)'}`);
      } finally {
        bitmap.close();
      }
    }
    preview.textContent = shown.join('\n\n');
    preview.hidden = false;
    const withText = pages.filter((p) => p.paragraphs.length > 0).length;
    if (withText === 0) {
      throw new UnreadableFile('No clear text found. This works best on screenshots, scans and photos where the text fills most of the frame; try cropping to the text.');
    }
    const words = pages.reduce((n, p) => n + p.paragraphs.reduce((m, q) => m + q.text.split(/\s+/).length, 0), 0);
    const base = files.length === 1 ? baseName(files[0]!.file.name) : 'images';
    let bytes: Uint8Array;
    try {
      bytes = buildDocx(pages, { title: base, pageBreaks: true });
    } catch (e) {
      throw nameBare('DocxBuildFailed', e);
    }
    progress.set('Done', 1);
    const out: OutputFile = {
      name: `${base}.docx`,
      blob: new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      note: `${words} words from ${withText} of ${files.length} ${files.length === 1 ? 'image' : 'images'}`,
    };
    return [out];
  },
});
