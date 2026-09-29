import { createShell, processEach, radio } from '../lib/shell';
import { flattenPdf, type FlattenMode } from '../lib/flatten-pdf';
import { suffixName, type OutputFile } from '../lib/files';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

createShell({
  async process(files, progress) {
    const mode = radio('mode', 'vector') as FlattenMode;
    return processEach(files, progress, 'Flattening', async (entry, i) => {
      const r = await flattenPdf(new Uint8Array(await entry.file.arrayBuffer()), mode, (done, total) =>
        progress.set(`Flattening ${entry.file.name}: page ${done} of ${total}`, (i + done / total) / files.length),
      );
      let note: string;
      if (mode === 'image') note = `${plural(r.pages, 'page')} turned into images; nothing left to select or edit`;
      else if (r.flattened === 0) note = `${plural(r.pages, 'page')}; there were no form fields or annotations to flatten`;
      else {
        const other = r.flattened - r.fields;
        const parts = [r.fields ? plural(r.fields, 'form field') : '', other ? plural(other, 'annotation') : ''].filter(Boolean).join(' and ');
        note = `${parts} flattened into ${plural(r.pages, 'page')}${r.kept ? `; ${plural(r.kept, 'note')} without a drawing kept as ${r.kept === 1 ? 'a note' : 'notes'}` : ''}`;
      }
      const out: OutputFile = {
        name: suffixName(entry.file.name, '-flat', 'pdf'),
        blob: new Blob([r.bytes as BlobPart], { type: 'application/pdf' }),
        originalSize: entry.file.size,
        note,
      };
      return out;
    });
  },
  resultsTitle: () => 'Flattened',
});
