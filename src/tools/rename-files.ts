import { bool, createShell, num, radio, str, type ShellFile } from '../lib/shell';
import { plainZip, type ZipEntry } from '../lib/zip-write';
import { renameAll, type RenameOptions } from '../lib/rename-files';

/**
 * Bulk rename: the files go into one ZIP under their new names, bytes untouched.
 * Names are used only to build the preview and the ZIP; they are never sent,
 * logged or stored, and the analytics events carry counts and sizes only.
 */

let current: ShellFile[] = [];

function options(): RenameOptions {
  const casing = radio('rn-casing', 'keep') as RenameOptions['casing'];
  return {
    prefix: str('rn-prefix'),
    suffix: str('rn-suffix'),
    number: bool('rn-number'),
    start: num('rn-start', 1),
    pad: num('rn-pad', 3),
    numberFirst: radio('rn-place', 'after') === 'before',
    find: str('rn-find'),
    replace: str('rn-replace'),
    matchCase: bool('rn-case-sensitive'),
    casing,
    keepExtension: bool('rn-keep-ext'),
  };
}

const rows = () => renameAll(current.map((f) => f.file.name), options());

function renderPreview() {
  const box = document.getElementById('rn-preview')!;
  const body = document.getElementById('rn-rows')!;
  const note = document.getElementById('rn-note')!;
  box.hidden = current.length === 0;
  body.replaceChildren();
  const list = rows();
  for (const r of list) {
    const tr = document.createElement('tr');
    if (r.adjusted) tr.className = 'rn-adjusted';
    const a = document.createElement('td');
    a.textContent = r.oldName;
    const b = document.createElement('td');
    b.textContent = r.newName;
    tr.append(a, b);
    body.append(tr);
  }
  const fixed = list.filter((r) => r.adjusted).length;
  note.hidden = fixed === 0;
  note.textContent = fixed ? `${fixed} ${fixed === 1 ? 'name was' : 'names were'} the same as an earlier one, so a counter was added (shown in italics).` : '';
}

createShell({
  outputFormat: () => 'zip',
  onFilesChanged(files) {
    current = files;
    renderPreview();
  },
  async process(files, progress) {
    const names = renameAll(files.map((f) => f.file.name), options());
    const entries: ZipEntry[] = [];
    for (const [i, f] of files.entries()) {
      progress.set(`Reading file ${i + 1} of ${files.length}`, (i / files.length) * 0.8);
      entries.push({ path: names[i]!.newName, data: new Uint8Array(await f.file.arrayBuffer()), modified: new Date(f.file.lastModified || Date.now()) });
    }
    progress.set('Writing the ZIP', 0.9);
    const bytes = plainZip(entries);
    return [
      {
        name: 'renamed-files.zip',
        blob: new Blob([bytes as BlobPart], { type: 'application/zip' }),
        originalSize: files.reduce((n, f) => n + f.file.size, 0),
        note: `${files.length.toLocaleString('en')} ${files.length === 1 ? 'file' : 'files'} renamed`,
      },
    ];
  },
  resultsTitle: () => 'Renamed files ready (ZIP)',
});

document.getElementById('options')?.addEventListener('input', renderPreview);
document.getElementById('options')?.addEventListener('change', renderPreview);
