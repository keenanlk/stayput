import { createShell, processEach, str, num } from '../lib/shell';
import { resizePdf, type Orientation, type PaperSize } from '../lib/resize-pdf';
import { suffixName, type OutputFile } from '../lib/files';

const NAMES: Record<PaperSize, string> = { a4: 'A4', letter: 'US Letter', legal: 'US Legal', a3: 'A3', a5: 'A5', tabloid: 'Tabloid' };
const pct = (k: number) => `${Math.round(k * 100)}%`;

createShell({
  async process(files, progress) {
    const size = str('size', 'letter') as PaperSize;
    const orientation = str('orientation', 'auto') as Orientation;
    // Millimetres to points.
    const margin = (num('margin', 0) * 72) / 25.4;
    return processEach(files, progress, 'Resizing', async (entry) => {
      const r = await resizePdf(new Uint8Array(await entry.file.arrayBuffer()), { size, orientation, margin });
      const scale = Math.abs(r.maxScale - r.minScale) < 0.005 ? `content at ${pct(r.minScale)}` : `content at ${pct(r.minScale)} to ${pct(r.maxScale)}`;
      const out: OutputFile = {
        name: suffixName(entry.file.name, `-${size}`, 'pdf'),
        blob: new Blob([r.bytes as BlobPart], { type: 'application/pdf' }),
        originalSize: entry.file.size,
        note: `${r.pages} page${r.pages === 1 ? '' : 's'} on ${NAMES[size]}, ${scale}`,
      };
      return out;
    });
  },
  resultsTitle: () => 'Resized',
});
