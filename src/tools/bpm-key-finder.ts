import { createShell, type ShellFile, type Skipped } from '../lib/shell';
import { channelsOf, decodeAudio, formatDuration } from '../lib/audio';
import { InputError, UnreadableFile, NamedError } from '../lib/input-error';
import { fromWorkerFailure } from '../lib/worker-error';
import { tempoName } from '../lib/metronome';
import { alsoReadAs, confidenceLabel, keyName, relativeOf, camelot, resultsCsv, type KeyResult, type ResultRow, type TempoResult } from '../lib/bpm-key';
import type { Reply } from '../lib/bpm-key.worker';

/** Longest file read; a decoded stereo buffer is about 21 MB a minute, and Safari decodes slowly. */
const MAX_SECONDS = 15 * 60;
/** Slack for the padding some encoders add, so a file that is exactly 15 minutes is not refused. */
const SLACK_SECONDS = 2;
/** Shortest clip that gives a tempo. */
const MIN_SECONDS = 10;
const SAMPLE_RATE = 44100;

const panel = document.getElementById('bk-panel')!;
const reportEl = document.getElementById('bk-report')!;

type Outcome = { row: ResultRow } | { error: string };
const results = new Map<number, Outcome>();
let shown: { entry: ShellFile; outcome: Outcome }[] = [];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

function copyButton(value: string, what: string) {
  const button = el('button', { type: 'button', className: 'btn btn-sm bk-copy' }, 'Copy');
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

const short = (name: string, tempo: TempoResult | null, key: KeyResult | null) =>
  `${name}: ${[tempo ? `${Math.round(tempo.bpm)} BPM` : '', key ? `${keyName(key.tonic, key.mode)} (${key.camelot})` : ''].filter(Boolean).join(', ')}`;

function tempoBlock(tempo: TempoResult | null) {
  const block = el('section', { className: 'bk-block bk-tempo' });
  if (!tempo) {
    block.append(el('p', { className: 'bk-sub' }, 'No steady beat could be found in this file. It may be spoken word, a drone or very quiet. The key is still shown if it could be read.'));
    return block;
  }
  const bpm = Math.round(tempo.bpm);
  block.append(el('div', { className: 'bk-big' }, `${bpm} BPM`), el('p', { className: 'bk-sub' }, tempoName(tempo.bpm)));
  const also = alsoReadAs(tempo.bpm);
  if (also) block.append(el('p', { className: 'bk-sub bk-also' }, `Also read as: ${also[0]} or ${also[1]}`));
  block.append(el('p', { className: 'bk-note' }, 'Assumes one steady tempo.'));
  return block;
}

function keyBlock(key: KeyResult | null) {
  const block = el('section', { className: 'bk-block bk-key' });
  if (!key) {
    block.append(el('p', { className: 'bk-sub' }, 'The key could not be read from this file.'));
    return block;
  }
  const rel = relativeOf(key.tonic, key.mode);
  block.append(
    el('div', { className: 'bk-big bk-keyname' }, keyName(key.tonic, key.mode)),
    el('p', { className: 'bk-sub' }, 'Camelot code ', el('span', { className: 'bk-camelot' }, key.camelot)),
    el('p', { className: 'bk-sub bk-relative' }, `Relative ${rel.mode}: ${keyName(rel.tonic, rel.mode)} (${camelot(rel.tonic, rel.mode)})`),
  );
  if (confidenceLabel(key.r) === 'unsure') {
    block.append(el('p', { className: 'bk-sub bk-unsure bk-confidence' }, 'Unsure: the key is a guess. Check it against your ears or an instrument.'));
  } else {
    block.append(el('p', { className: 'bk-sub bk-confidence' }, 'Likely'));
  }
  return block;
}

function render() {
  reportEl.replaceChildren();
  panel.hidden = shown.length === 0;
  for (const { entry, outcome } of shown) {
    const name = entry.file.name;
    if ('error' in outcome) {
      reportEl.append(el('article', { className: 'bk-card bk-failed' }, el('header', {}, el('strong', {}, name)), el('p', { className: 'bk-error' }, outcome.error)));
      continue;
    }
    const { row } = outcome;
    const body = el('div', { className: 'bk-body' });
    // When neither could be found the two blocks would both say so; show one message.
    if (!row.tempo && !row.key) body.append(el('p', { className: 'bk-error' }, 'No tempo or key could be found in this file.'));
    else body.append(tempoBlock(row.tempo), keyBlock(row.key));
    const actions = el('div', { className: 'bk-actions' }, copyButton(short(name, row.tempo, row.key), `the result for ${name}`));
    reportEl.append(el('article', { className: 'bk-card' }, el('header', {}, el('strong', {}, name), el('span', {}, formatDuration(row.duration))), body, actions));
  }
}

/** The file's length in seconds from its container, or null when that cannot be read without decoding. */
async function fileDuration(file: File): Promise<number | null> {
  try {
    const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const seconds = await input.computeDuration();
      return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    } finally {
      input.dispose?.();
    }
  } catch {
    return null;
  }
}

function checkLength(seconds: number) {
  if (seconds > MAX_SECONDS + SLACK_SECONDS) {
    const minutes = Math.round(seconds / 60);
    const long = minutes <= 15 ? 'just over 15 minutes' : `${minutes} minutes`;
    throw new InputError(`This file is ${long} long. This page reads files up to 15 minutes. Cut the part you want with Trim audio, then try again.`);
  }
  if (seconds < MIN_SECONDS) {
    const secs = Math.max(1, Math.round(seconds));
    throw new InputError(`This clip is ${secs} second${secs === 1 ? '' : 's'} long, which is too short to find a tempo. Use a clip of at least 10 seconds.`);
  }
}

let worker: Worker | undefined;
let nextId = 1;

function analyseInWorker(mono: Float32Array): Promise<{ tempo: TempoResult | null; key: KeyResult | null }> {
  worker ??= new Worker(new URL('../lib/bpm-key.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const done = (event: MessageEvent<Reply>) => {
      if (event.data.id !== id) return;
      w.removeEventListener('message', done);
      w.removeEventListener('error', failed);
      if ('error' in event.data) reject(fromWorkerFailure(event.data.name, event.data.error));
      else resolve({ tempo: event.data.tempo, key: event.data.key });
    };
    const failed = () => {
      w.removeEventListener('message', done);
      w.removeEventListener('error', failed);
      worker = undefined;
      reject(new NamedError('BpmKeyFinderFailed', 'The analysis stopped unexpectedly. Reload the page and try again, or use a shorter file.'));
    };
    w.addEventListener('message', done);
    w.addEventListener('error', failed);
    w.postMessage({ id, mono }, [mono.buffer]);
  });
}

async function analyseFile(file: File): Promise<ResultRow> {
  const known = await fileDuration(file);
  if (known !== null) checkLength(known);
  const buffer = await decodeAudio(file, SAMPLE_RATE);
  const duration = buffer.duration;
  if (known === null) checkLength(duration);
  // One mono copy for the worker; the decoded stereo buffer is dropped when this function returns.
  const [first] = channelsOf(buffer, true);
  const mono = first!.slice();
  let peak = 0;
  for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]!));
  if (peak < 0.001) throw new UnreadableFile('This file is silent, so there is nothing to analyse.');
  const { tempo, key } = await analyseInWorker(mono);
  return { name: file.name, duration, tempo, key };
}

createShell({
  onFilesChanged(files) {
    // Keep results only for files still in the list.
    for (const id of [...results.keys()]) if (!files.some((f) => f.id === id)) results.delete(id);
    shown = files.flatMap((entry) => (results.has(entry.id) ? [{ entry, outcome: results.get(entry.id)! }] : []));
    render();
  },
  autoDownloadSingle: false,
  resultsTitle: () => 'BPM and key ready',
  async process(files, progress) {
    results.clear();
    const skipped: Skipped[] = [];
    let firstError: unknown;
    for (const [i, entry] of files.entries()) {
      const label = files.length > 1 ? ` (${i + 1} of ${files.length})` : '';
      progress.set(`Reading ${entry.file.name}${label}`, i / files.length);
      try {
        results.set(entry.id, { row: await analyseFile(entry.file) });
      } catch (e) {
        firstError ??= e;
        const reason = e instanceof Error ? e.message : String(e);
        results.set(entry.id, { error: reason });
        skipped.push({ name: entry.file.name, reason });
      }
    }
    shown = files.flatMap((entry) => (results.has(entry.id) ? [{ entry, outcome: results.get(entry.id)! }] : []));
    render();
    const rows = shown.flatMap(({ outcome }) => ('row' in outcome ? [outcome.row] : []));
    if (rows.length === 0) throw firstError;
    progress.set('Done', 1);
    const blob = new Blob([resultsCsv(rows)], { type: 'text/csv' });
    return { outputs: [{ name: 'bpm-key-results.csv', blob, badge: 'CSV', note: `${rows.length} file${rows.length === 1 ? '' : 's'}` }], skipped };
  },
});
