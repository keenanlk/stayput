import { createShell, num, radio, str } from '../lib/shell';
import { extractPages, pageCount } from '../lib/pdf';
import { chunkPages, describePages, parsePageRange } from '../lib/ranges';
import { baseName, type OutputFile } from '../lib/files';

let count = 0;
const info = document.getElementById('page-info')!;

const modeInputs = document.querySelectorAll<HTMLInputElement>('input[name="split-mode"]');
const syncMode = () => {
  const mode = radio('split-mode', 'range');
  document.getElementById('range-field')!.hidden = mode !== 'range';
  document.getElementById('every-field')!.hidden = mode !== 'every';
};
modeInputs.forEach((i) => i.addEventListener('change', syncMode));
syncMode();

createShell({
  async onFilesChanged(files) {
    count = 0;
    info.textContent = '';
    const f = files[0];
    if (!f) return;
    try {
      count = await pageCount(new Uint8Array(await f.file.arrayBuffer()));
      info.textContent = `${count} page${count === 1 ? '' : 's'}`;
      (document.getElementById('range') as HTMLInputElement).placeholder = count > 1 ? `e.g. 1-${Math.min(3, count)}, ${count}` : '1';
    } catch (e) {
      info.textContent = e instanceof Error ? e.message : String(e);
    }
  },
  async process(files, progress) {
    const entry = files[0]!;
    const bytes = new Uint8Array(await entry.file.arrayBuffer());
    if (!count) count = await pageCount(bytes);
    const base = baseName(entry.file.name);
    const mode = radio('split-mode', 'range');
    const groups: number[][] =
      mode === 'range' ? [parsePageRange(str('range'), count)] : mode === 'each' ? chunkPages(count, 1) : chunkPages(count, num('every', 1));
    const outs: OutputFile[] = [];
    for (const [i, g] of groups.entries()) {
      progress.set(`Writing part ${i + 1} of ${groups.length}`, i / groups.length);
      const out = await extractPages(bytes, g);
      const label = g.length === 1 ? `page-${g[0]! + 1}` : `pages-${describePages(g)}`;
      outs.push({ name: `${base}-${label}.pdf`, blob: new Blob([out as BlobPart], { type: 'application/pdf' }) });
    }
    progress.set('Done', 1);
    return outs;
  },
  resultsTitle: (o) => (o.length === 1 ? 'Extracted' : `Split into ${o.length} files`),
});
