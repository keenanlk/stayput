import { createShell, processEach, type ShellFile } from '../lib/shell';
import { fieldLabel, readPdfMetadata, removePdfMetadata, type PdfMetadata } from '../lib/pdf-meta';
import { formatBytes, type OutputFile } from '../lib/files';

const report = document.getElementById('meta-report')!;
const summaries = new Map<number, PdfMetadata | Error>();

/** Everything found, as short lines a person can check before and after. */
export function describe(m: PdfMetadata): string[] {
  const lines = m.fields.map((f) => `${fieldLabel(f.key)}: ${f.value.length > 120 ? `${f.value.slice(0, 117)}…` : f.value}`);
  if (m.xmpPackets) lines.push(`XMP metadata: ${m.xmpPackets} packet${m.xmpPackets === 1 ? '' : 's'} (${formatBytes(m.xmpBytes)})`);
  if (m.pieceInfo) lines.push(`Private app data (PieceInfo): on ${m.pieceInfo} object${m.pieceInfo === 1 ? '' : 's'}`);
  if (m.hasId) lines.push('File ID: yes');
  return lines;
}

async function renderReport(files: ShellFile[]) {
  report.innerHTML = '';
  report.hidden = files.length === 0;
  for (const entry of files) {
    if (!summaries.has(entry.id)) {
      try {
        summaries.set(entry.id, await readPdfMetadata(new Uint8Array(await entry.file.arrayBuffer())));
      } catch (e) {
        summaries.set(entry.id, e instanceof Error ? e : new Error(String(e)));
      }
    }
    const s = summaries.get(entry.id)!;
    const row = document.createElement('div');
    row.className = 'meta-row';
    const name = document.createElement('strong');
    name.textContent = entry.file.name;
    row.append(name);
    if (s instanceof Error) {
      const detail = document.createElement('span');
      detail.textContent = ` ${s.message}`;
      detail.className = 'muted';
      row.append(detail);
    } else {
      const lines = describe(s);
      if (s.fields.some((f) => f.key === 'Author')) row.classList.add('has-gps');
      const list = document.createElement('ul');
      list.className = 'meta-list';
      for (const l of lines.length ? lines : ['No metadata found']) {
        const li = document.createElement('li');
        li.textContent = l;
        list.append(li);
      }
      row.append(list);
    }
    report.append(row);
  }
}

createShell({
  onFilesChanged: renderReport,
  async process(files, progress) {
    return processEach(files, progress, 'Cleaning', async (entry) => {
      const { bytes, before } = await removePdfMetadata(new Uint8Array(await entry.file.arrayBuffer()));
      const removed = before.fields.length + before.xmpPackets + before.pieceInfo + (before.hasId ? 1 : 0);
      const out: OutputFile = {
        // Same name: a "-clean" suffix would itself say the file was scrubbed.
        name: entry.file.name,
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        note: removed ? `removed ${[before.fields.length ? `${before.fields.length} info field${before.fields.length === 1 ? '' : 's'}` : '', before.xmpPackets ? 'XMP' : '', before.pieceInfo ? 'app data' : '', before.hasId ? 'file ID' : ''].filter(Boolean).join(', ')}` : 'no metadata found',
      };
      return out;
    });
  },
  resultsTitle: () => 'Cleaned',
});
