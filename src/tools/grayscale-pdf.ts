import { createShell, processEach } from '../lib/shell';
import { grayscalePdf } from '../lib/grayscale-pdf';
import { suffixName, type OutputFile } from '../lib/files';

createShell({
  async process(files, progress) {
    return processEach(files, progress, 'Converting', async (entry) => {
      const result = await grayscalePdf(new Uint8Array(await entry.file.arrayBuffer()));
      const { bytes, pages, overlaidPages } = result;
      const out: OutputFile = {
        name: suffixName(entry.file.name, '-grayscale', 'pdf'),
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        note: noteFor(pages, overlaidPages, result.imagesUnsupported),
      };
      return out;
    });
  },
  resultsTitle: () => 'Converted to grayscale',
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Say what was converted, and be plain about pages that only look grey. */
function noteFor(pages: number, overlaid: number, unsupportedImages: number): string {
  if (overlaid === 0) return `${plural(pages, 'page')} converted to grayscale; text stays text`;
  const done = pages - overlaid;
  const extra = unsupportedImages ? ` (${plural(unsupportedImages, 'image')} in a format we can't convert)` : '';
  const head = done === 0 ? `No page could be fully converted` : `${plural(done, 'page')} converted`;
  return `${head}; ${plural(overlaid, 'page')} ${overlaid === 1 ? 'has' : 'have'} colour we couldn't convert${extra} and ${overlaid === 1 ? 'is' : 'are'} greyed on top, so the colour is still stored in the file. Text stays text`;
}
