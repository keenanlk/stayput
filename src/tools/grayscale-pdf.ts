import { createShell, processEach } from '../lib/shell';
import { grayscalePdf } from '../lib/grayscale-pdf';
import { suffixName, type OutputFile } from '../lib/files';

createShell({
  async process(files, progress) {
    return processEach(files, progress, 'Converting', async (entry) => {
      const { bytes, pages } = await grayscalePdf(new Uint8Array(await entry.file.arrayBuffer()));
      const out: OutputFile = {
        name: suffixName(entry.file.name, '-grayscale', 'pdf'),
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        note: `${pages} page${pages === 1 ? '' : 's'} in grayscale; text stays text (scanned pages stay images)`,
      };
      return out;
    });
  },
  resultsTitle: () => 'Converted to grayscale',
});
