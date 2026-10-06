import { createShell, type ShellFile, type Skipped } from '../lib/shell';
import { formatBytes } from '../lib/files';
import { ALGORITHMS, compareChecksum, hashFile, type Digests } from '../lib/checksum';

const panel = document.getElementById('cs-panel')!;
const reportEl = document.getElementById('cs-report')!;
const paste = document.getElementById('cs-paste') as HTMLInputElement;
const verdict = document.getElementById('cs-verdict')!;

const results = new Map<number, Digests>();
/** The files whose digests are on screen, in list order. */
let shown: { entry: ShellFile; digests: Digests }[] = [];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

function copyButton(value: string, what: string) {
  const button = el('button', { type: 'button', className: 'btn btn-sm' }, 'Copy');
  button.setAttribute('aria-label', `Copy ${what}`);
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    setTimeout(() => (button.textContent = 'Copy'), 2000);
  });
  return button;
}

function render() {
  reportEl.replaceChildren();
  panel.hidden = shown.length === 0;
  for (const { entry, digests } of shown) {
    const list = el('ul', { className: 'cs-digests' });
    for (const a of ALGORITHMS) {
      const li = el('li', {}, el('span', { className: 'k' }, a.label), el('code', { className: 'digest' }, digests[a.id]), copyButton(digests[a.id], `${a.label} of ${entry.file.name}`));
      li.dataset.algorithm = a.id;
      list.append(li);
    }
    reportEl.append(el('article', { className: 'cs-card' }, el('header', {}, el('strong', {}, entry.file.name), el('span', {}, formatBytes(entry.file.size))), list));
  }
  compare();
}

function compare() {
  for (const li of reportEl.querySelectorAll('li.is-match')) li.classList.remove('is-match');
  const result = compareChecksum(paste.value, shown.map((s) => s.digests));
  verdict.hidden = result.kind === 'empty';
  verdict.className = 'cs-verdict';
  if (result.kind === 'empty') return;
  if (result.kind === 'match') {
    const name = shown[result.index]!.entry.file.name;
    verdict.textContent = shown.length === 1 ? `Match: it is the ${result.algorithm.label} of this file.` : `Match: it is the ${result.algorithm.label} of ${name}.`;
    verdict.classList.add('ok');
    reportEl.querySelectorAll('.cs-card')[result.index]?.querySelector(`li[data-algorithm="${result.algorithm.id}"]`)?.classList.add('is-match');
  } else {
    verdict.textContent = `No match. ${result.note}`;
    verdict.classList.add('bad');
  }
}

paste.addEventListener('input', compare);

createShell({
  onFilesChanged(files) {
    // Keep digests only for files still in the list, and clear the old ones when the list changes.
    for (const id of [...results.keys()]) if (!files.some((f) => f.id === id)) results.delete(id);
    shown = files.flatMap((entry) => (results.has(entry.id) ? [{ entry, digests: results.get(entry.id)! }] : []));
    render();
  },
  autoDownloadSingle: false,
  resultsTitle: () => 'Checksums ready',
  async process(files, progress) {
    results.clear();
    const skipped: Skipped[] = [];
    for (const [i, entry] of files.entries()) {
      const label = files.length > 1 ? ` (${i + 1} of ${files.length})` : '';
      progress.set(`Reading ${entry.file.name}${label}`, 0);
      try {
        results.set(
          entry.id,
          await hashFile(entry.file, (fraction) => progress.set(`Reading ${entry.file.name}${label}: ${Math.floor(fraction * 100)}%`, (i + fraction) / files.length)),
        );
      } catch (e) {
        skipped.push({ name: entry.file.name, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    shown = files.flatMap((entry) => (results.has(entry.id) ? [{ entry, digests: results.get(entry.id)! }] : []));
    render();
    if (shown.length === 0) throw new Error(skipped.length === 1 ? skipped[0]!.reason : `None of the files could be checked. ${skipped[0]!.reason}`);
    progress.set('Done', 1);
    const lines = shown.flatMap(({ entry, digests }) => ALGORITHMS.map((a) => `${a.label} (${entry.file.name}) = ${digests[a.id]}`));
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
    return { outputs: [{ name: 'checksums.txt', blob, badge: 'TXT', note: `${shown.length} file${shown.length === 1 ? '' : 's'}` }], skipped };
  },
});
