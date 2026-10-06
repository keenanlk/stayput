import { createShell, processEach, radio } from '../lib/shell';
import { decodeImage, thumbnail } from '../lib/image';
import { replaceExt, type OutputFile } from '../lib/files';
import { readText, unwrap } from '../lib/ocr';

createShell({
  // The text is shown on the page to copy; a download is one click away.
  autoDownloadSingle: false,
  resultsTitle: (outs) => (outs.length === 1 ? 'Text found' : `Text from ${outs.length} images`),
  async process(files, progress) {
    const join = radio('lines', 'keep') === 'join';
    return processEach(files, progress, 'Reading', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const { bitmap } = await decodeImage(entry.file);
      try {
        const result = await readText(bitmap, (stage, f) =>
          stage === 'loading'
            ? progress.set(`Loading the text reader (one time, about 6 MB): ${Math.round(f * 100)}%`, share(0.05))
            : progress.set(`Reading the text in ${entry.file.name}…`, share(0.3)),
        );
        if (!result.text) throw new Error('No clear text found. This works best on screenshots, scans and photos where the text fills most of the frame; try cropping to the text.');
        const text = join ? unwrap(result.text) : result.text;
        const words = text.split(/\s+/).filter(Boolean).length;
        const out: OutputFile = {
          name: replaceExt(entry.file.name, 'txt'),
          blob: new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' }),
          previewUrl: await thumbnail(bitmap),
          text,
          note: `${words} ${words === 1 ? 'word' : 'words'}${result.confidence < 60 ? ', low confidence: check it' : ''}`,
        };
        return out;
      } finally {
        bitmap.close();
      }
    });
  },
});
