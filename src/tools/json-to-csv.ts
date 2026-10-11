import { createShell, bool, radio, str } from '../lib/shell';
import { formatBytes, replaceExt } from '../lib/files';
import { detectDirection, DataError, convert, type Converted, type Delimiter, type Direction, type Job } from '../lib/csv-json';
import { InputError, UnreadableFile } from '../lib/input-error';
import type { Reply } from '../lib/csv-json.worker';

/** Above this a notice says it can take a while; above the second the page stops with a message. */
const LARGE_BYTES = 50 * 1024 * 1024;
const MAX_BYTES = 200 * 1024 * 1024;
const HEAD_BYTES = 64 * 1024;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const textarea = $<HTMLTextAreaElement>('jc-text');
const detected = $('jc-detected');
const toCsv = $('jc-to-csv');
const toJson = $('jc-to-json');
const whichField = $('jc-which-field');
const which = $<HTMLSelectElement>('jc-which');

/** The file made from pasted text, while it is the one in the list. */
let pasted: File | undefined;
/** The direction detected from the file in the list. */
let detectedDirection: Direction = 'json-to-csv';
let lastResult: Blob | undefined;
/** The direction of the run in progress or last run. */
let ranDirection: Direction = 'json-to-csv';

const DIRECTION_NAME: Record<Direction, string> = { 'json-to-csv': 'JSON to CSV', 'csv-to-json': 'CSV to JSON' };

const chosen = (): Direction => {
  const v = radio('direction', 'auto');
  return v === 'json-to-csv' || v === 'csv-to-json' ? v : detectedDirection;
};

function syncGroups() {
  const d = chosen();
  toCsv.hidden = d !== 'json-to-csv';
  toJson.hidden = d !== 'csv-to-json';
}

async function head(file: File): Promise<string> {
  return file.slice(0, HEAD_BYTES).text();
}

async function detect(file: File | undefined) {
  if (!file) {
    detected.hidden = true;
    return;
  }
  detectedDirection = detectDirection(await head(file));
  detected.hidden = false;
  detected.textContent = `Looks like ${detectedDirection === 'json-to-csv' ? 'JSON' : 'CSV'}, so the direction is ${DIRECTION_NAME[detectedDirection]}. Change it under Direction if that is wrong.`;
  syncGroups();
}

function job(direction: Direction): Job {
  if (direction === 'json-to-csv') {
    return {
      direction,
      delimiter: str('jc-out-delimiter', ',') as Delimiter,
      eol: str('jc-eol', 'crlf') === 'lf' ? '\n' : '\r\n',
      flatten: bool('jc-flatten'),
      joinArrays: bool('jc-join'),
      which: whichField.hidden ? undefined : which.value,
    };
  }
  const delimiter = str('jc-in-delimiter', 'auto');
  return {
    direction,
    delimiter: delimiter === 'auto' ? undefined : (delimiter as Delimiter),
    headers: bool('jc-headers'),
    detectTypes: bool('jc-types'),
    pretty: str('jc-pretty', 'pretty') === 'pretty',
  };
}

type Done = { blob: Blob; summary: Omit<Converted, 'text'> };

let worker: Worker | undefined;
let nextId = 0;

/** Convert in a worker; where one cannot start (very old browsers), on the page itself. */
async function run(file: File, j: Job, bom: boolean): Promise<Done> {
  let w: Worker;
  try {
    worker ??= new Worker(new URL('../lib/csv-json.worker.ts', import.meta.url), { type: 'module' });
    w = worker;
  } catch {
    const { text, ...summary } = convert((await file.text()).replace(/^﻿/, ''), j);
    const withBom = bom && j.direction === 'json-to-csv';
    return { blob: new Blob(withBom ? ['﻿', text] : [text]), summary };
  }
  const id = ++nextId;
  return new Promise<Done>((resolve, reject) => {
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = (e: MessageEvent<Reply>) => {
      if (e.data.id !== id) return;
      done();
      const r = e.data;
      if (r.type === 'done') return resolve({ blob: r.blob, summary: r.summary });
      if (r.arrays) reject(new DataError(r.message, r.arrays));
      else if (r.name === 'InputError') reject(new InputError(r.message));
      else if (r.name === 'UnreadableFile') reject(new UnreadableFile(r.message));
      else reject(Object.assign(new Error(r.message), { name: r.name }));
    };
    const onError = () => {
      done();
      worker = undefined;
      reject(new Error('The conversion ran out of memory or stopped. A phone may not have room for a file this large; split it and convert the pieces.'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, file, job: j, bom });
  });
}

function showLists(lists: string[]) {
  which.replaceChildren(...lists.map((name) => Object.assign(document.createElement('option'), { value: name, textContent: name })));
  whichField.hidden = false;
}

function renderResult(name: string, summary: Done['summary'], size: number) {
  document.getElementById('jc-result')?.remove();
  const box = document.createElement('div');
  box.className = 'jc-result';
  box.id = 'jc-result';
  const head = document.createElement('div');
  head.className = 'jc-head';
  const stats = document.createElement('span');
  stats.className = 'jc-stats';
  const n = (v: number, word: string) => `${v.toLocaleString('en-US')} ${word}${v === 1 ? '' : 's'}`;
  stats.textContent = `${n(summary.rows, 'row')}, ${n(summary.columns, summary.direction === 'json-to-csv' ? 'column' : 'key')} · ${formatBytes(size)}`;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn btn-sm btn-primary';
  copy.textContent = 'Copy';
  copy.setAttribute('aria-label', `Copy the ${summary.direction === 'json-to-csv' ? 'CSV' : 'JSON'}`);
  copy.addEventListener('click', async () => {
    try {
      const text = (await lastResult!.text()).replace(/^﻿/, '');
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Copy failed';
    }
    setTimeout(() => (copy.textContent = 'Copy'), 2000);
  });
  head.append(stats, copy);
  box.append(head);

  const scroll = document.createElement('div');
  scroll.className = 'jc-scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', `Preview of ${name}`);
  if (summary.direction === 'json-to-csv') {
    const table = document.createElement('table');
    table.className = 'jc-table';
    const [first, ...rest] = summary.previewRows;
    const cells = (tag: 'th' | 'td', row: string[]) => {
      const tr = document.createElement('tr');
      for (const c of row) tr.append(Object.assign(document.createElement(tag), { textContent: c }));
      return tr;
    };
    const tbody = document.createElement('tbody');
    if (summary.hasHeader && first) {
      const thead = document.createElement('thead');
      thead.append(cells('th', first));
      table.append(thead);
      for (const r of rest) tbody.append(cells('td', r));
    } else {
      for (const r of summary.previewRows) tbody.append(cells('td', r));
    }
    table.append(tbody);
    scroll.append(table);
  } else {
    const pre = document.createElement('pre');
    pre.className = 'jc-pre';
    pre.textContent = summary.previewLines.join('\n');
    scroll.append(pre);
  }
  box.append(scroll);

  const notes: string[] = [];
  const shown = summary.previewRows.length - (summary.hasHeader ? 1 : 0);
  if (summary.direction === 'json-to-csv') {
    if (summary.rows > shown) notes.push(`Showing the first ${shown} rows.`);
    notes.push('Cells starting with = + - @ may run as formulas in Excel.');
  } else {
    if (summary.previewLines.length >= 40) notes.push('Showing the first 40 lines.');
    if (summary.padded > 0) notes.push(`${n(summary.padded, 'row')} had a different number of values than the widest row; short rows were filled with empty text.`);
  }
  for (const text of notes) {
    const p = document.createElement('p');
    p.className = 'jc-note';
    p.textContent = text;
    box.append(p);
  }
  $('results-list').after(box);
}

const shell = createShell({
  autoDownloadSingle: false,
  resultsTitle: () => 'Converted',
  outputFormat: () => (ranDirection === 'json-to-csv' ? 'csv' : 'json'),
  async onFilesChanged(files) {
    const entry = files[0];
    if (entry?.file !== pasted) {
      pasted = undefined;
      textarea.value = '';
    }
    whichField.hidden = true;
    await detect(entry?.file);
  },
  async process(files, progress) {
    const file = files[0]!.file;
    if (file.size > MAX_BYTES) throw new InputError('This file is too large for a browser tab. Split it first, then convert the pieces.');
    const picked = radio('direction', 'auto');
    const direction: Direction = picked === 'json-to-csv' || picked === 'csv-to-json' ? picked : detectDirection(await head(file));
    ranDirection = direction;
    if (file.size > LARGE_BYTES) progress.set('Large file, this can take a while', 0);
    else progress.set(direction === 'json-to-csv' ? 'Reading the JSON' : 'Reading the CSV', 0);
    try {
      const { blob, summary } = await run(file, job(direction), bool('jc-bom'));
      lastResult = blob;
      progress.set('Done', 1);
      const name = replaceExt(pasted === file ? 'data' : file.name, direction === 'json-to-csv' ? 'csv' : 'json');
      renderResult(name, summary, blob.size);
      const note = `${summary.rows.toLocaleString('en-US')} row${summary.rows === 1 ? '' : 's'}`;
      return [{ name, blob, badge: direction === 'json-to-csv' ? 'CSV' : 'JSON', note }];
    } catch (e) {
      if (e instanceof DataError && e.arrays) showLists(e.arrays);
      throw e;
    }
  },
});

// Pasted text goes into the list as a file, so the same Convert button and options apply.
let timer: ReturnType<typeof setTimeout> | undefined;
let pending = false;
function takePasted() {
  clearTimeout(timer);
  pending = false;
  const text = textarea.value;
  if (text.trim() === '') {
    if (pasted) {
      pasted = undefined;
      $('clear').click();
    }
    return;
  }
  pasted = new File([text], 'data.txt', { type: 'text/plain' });
  void shell.addFiles([pasted]);
}
textarea.addEventListener('input', () => {
  clearTimeout(timer);
  pending = true;
  timer = setTimeout(takePasted, 200);
});
// Convert pressed within the pause after typing: take what is in the box first.
$('run').addEventListener('click', () => pending && takePasted(), true);

for (const radioEl of document.querySelectorAll('input[name="direction"]')) radioEl.addEventListener('change', syncGroups);
syncGroups();
