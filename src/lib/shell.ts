/**
 * Shared runtime for every tool page: drop zone, file list, options, run
 * button, progress, results and downloads. Tool scripts plug in a `process`
 * function and read their options through the helpers below.
 */
import { downloadBlob, formatBytes, zipFiles, type OutputFile } from './files';
import { classifyError, trackFilesAdded, trackToolRun } from './analytics';
import { EncoderStall } from './encoder-watchdog';
import { mountNetProof } from './netproof';
import { mountInstallPrompt } from './install';
import { mountNextSteps } from './next-steps';
import { warmDecoders } from './vendor';
import { droppedFiles } from './folder-drop';

export interface ShellFile {
  id: number;
  file: File;
  thumb?: string;
}

export interface Progress {
  set(text: string, fraction?: number): void;
}

export interface Skipped {
  name: string;
  reason: string;
}

/** What `process` returns: plain outputs, or outputs plus the files that were skipped. */
export type ProcessResult = OutputFile[] | { outputs: OutputFile[]; skipped: Skipped[] };

export interface ShellOptions {
  /** Produce a preview URL for a file in the list (optional). */
  thumbnail?: (file: File) => Promise<string | undefined>;
  /** Allow reordering with arrows. Default true when multiple. */
  reorder?: boolean;
  /** Called after files are added, removed or reordered. */
  onFilesChanged?: (files: ShellFile[]) => void | Promise<void>;
  /** Do the work. Return the outputs to show. */
  process: (files: ShellFile[], progress: Progress) => Promise<ProcessResult>;
  /** Title shown above the results. */
  resultsTitle?: (outputs: OutputFile[]) => string;
  /** The output format picked, when a tool offers several; reported with tool_run. */
  outputFormat?: () => string;
  /** Automatically download when there is exactly one output. Default true. */
  autoDownloadSingle?: boolean;
  /** Open dropped folders and add the files inside them (see folder-drop.ts). Default false. */
  folders?: boolean;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

export function num(id: string, fallback: number): number {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  const v = el ? Number(el.value) : NaN;
  return Number.isFinite(v) ? v : fallback;
}
export function str(id: string, fallback = ''): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el?.value ?? fallback;
}
export function bool(id: string): boolean {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return !!el?.checked;
}
export function radio(name: string, fallback: string): string {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  return el?.value ?? fallback;
}
/** Mirror a range input's value into a display element. */
export function bindRange(id: string, outId: string, format: (v: number) => string = String): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  const out = document.getElementById(outId);
  if (!input || !out) return;
  const update = () => (out.textContent = format(Number(input.value)));
  input.addEventListener('input', update);
  update();
}

/** Prefix an error with the file it came from, once. */
export function describeError(file: File, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.startsWith(file.name) ? msg : `${file.name}: ${msg}`;
}

/**
 * Run `fn` for every file in a batch. One bad file (a corrupt download, a
 * PDF dropped on an image tool) no longer fails the whole batch: it is
 * reported as skipped and the rest go through. If every file fails, the
 * first error is thrown so the tool shows it.
 */
export async function processEach(
  files: ShellFile[],
  progress: Progress,
  verb: string,
  fn: (entry: ShellFile, index: number) => Promise<OutputFile | OutputFile[] | undefined>,
): Promise<{ outputs: OutputFile[]; skipped: Skipped[] }> {
  const outputs: OutputFile[] = [];
  const skipped: Skipped[] = [];
  let firstError: unknown;
  for (const [i, entry] of files.entries()) {
    progress.set(`${verb} ${entry.file.name} (${i + 1} of ${files.length})`, i / files.length);
    try {
      const out = await fn(entry, i);
      if (Array.isArray(out)) outputs.push(...out);
      else if (out) outputs.push(out);
    } catch (e) {
      console.warn(`${entry.file.name}:`, e);
      firstError ??= e;
      skipped.push({ name: entry.file.name, reason: e instanceof Error ? e.message : String(e) });
      if (e instanceof EncoderStall) {
        // The encoder is the problem, not this file; the rest would only wait out the same silence.
        for (const rest of files.slice(i + 1)) skipped.push({ name: rest.file.name, reason: e.message });
        break;
      }
    }
  }
  if (outputs.length === 0 && skipped.length > 0) throw firstError instanceof EncoderStall ? firstError : new Error(describeError(files[0]!.file, firstError));
  progress.set('Done', 1);
  return { outputs, skipped };
}

export function createShell(opts: ShellOptions) {
  const root = $('tool');
  const multiple = root.dataset.multiple === 'true';
  const reorder = opts.reorder ?? multiple;
  const drop = $('drop');
  const input = $<HTMLInputElement>('file-input');
  const list = $('file-list');
  const run = $<HTMLButtonElement>('run');
  const clear = $<HTMLButtonElement>('clear');
  const progress = $('progress');
  const progressText = $('progress-text');
  const progressBar = $('progress-bar');
  const error = $('error');
  const hint = $('run-hint');
  const results = $('results');
  const resultsList = $('results-list');
  const resultsTitle = $('results-title');
  const downloadAll = $<HTMLButtonElement>('download-all');

  let files: ShellFile[] = [];
  let nextId = 1;
  let outputs: OutputFile[] = [];
  let busy = false;
  // An attempt starts when files are added and ends at a clear or when new
  // files arrive after a successful run. files_added fires once per attempt, and
  // tool_run marks the attempt's first success, so completion = first successes / files_added.
  let attempt: { ok: boolean } | undefined;

  const isImage = (f: File) => f.type.startsWith('image/') || /\.(heic|heif|avif|jxl)$/i.test(f.name);

  async function addFiles(incoming: FileList | File[]) {
    const all = Array.from(incoming);
    const empty = all.filter((f) => f.size === 0);
    const arr = all.filter((f) => f.size > 0);
    hideResults();
    hideError();
    if (empty.length > 0) {
      const names = empty.map((f) => f.name).slice(0, 3).join(', ');
      showError(
        empty.length === all.length
          ? `${names} ${empty.length === 1 ? 'is' : 'are'} empty (0 bytes). ${empty.length === 1 ? 'It' : 'They'} may not have finished downloading or syncing.`
          : `Skipped ${empty.length} empty file${empty.length === 1 ? '' : 's'} (0 bytes): ${names}${empty.length > 3 ? '…' : ''}.`,
      );
    }
    if (arr.length === 0) return;
    if (!multiple) files = [];
    for (const file of arr) {
      const entry: ShellFile = { id: nextId++, file };
      files.push(entry);
      if (!multiple) break;
    }
    render();
    if (!attempt || attempt.ok) {
      attempt = { ok: false };
      trackFilesAdded({ tool: root.dataset.slug ?? 'unknown', files: files.length, inputBytes: files.reduce((n, f) => n + f.file.size, 0) });
    }
    // Announce the files before any inspection work (thumbnails, unlocking),
    // so the network panel counts every request made from here on.
    root.dataset.inputBytes = String(files.reduce((n, f) => n + f.file.size, 0));
    root.dispatchEvent(new CustomEvent('stayput:files'));
    // Thumbnails after render so the list appears immediately.
    if (opts.thumbnail) {
      for (const entry of files) {
        if (entry.thumb !== undefined) continue;
        entry.thumb = '';
        try {
          entry.thumb = (await opts.thumbnail(entry.file)) ?? '';
        } catch {
          entry.thumb = '';
        }
        const img = list.querySelector<HTMLElement>(`[data-id="${entry.id}"] .thumb`);
        if (img && entry.thumb) img.innerHTML = `<img src="${entry.thumb}" alt="">`;
      }
    }
    await filesChanged();
  }

  /**
   * Tools inspect files as soon as they are added (page counts, thumbnails).
   * A failure there (a damaged PDF, a wrong password) used to vanish as an
   * unhandled rejection; now it is shown where the result would be.
   */
  async function filesChanged() {
    try {
      await opts.onFilesChanged?.(files);
    } catch (e) {
      console.warn(e);
      const first = files[0];
      showError(first ? describeError(first.file, e) : e instanceof Error ? e.message : String(e));
    }
  }

  function remove(id: number) {
    files = files.filter((f) => f.id !== id);
    hideResults();
    hideError();
    render();
    void filesChanged();
  }

  function move(id: number, delta: number) {
    const i = files.findIndex((f) => f.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= files.length) return;
    const [item] = files.splice(i, 1);
    files.splice(j, 0, item!);
    hideResults();
    render();
    void filesChanged();
  }

  function render() {
    list.innerHTML = '';
    for (const [i, entry] of files.entries()) {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.dataset.id = String(entry.id);
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (entry.thumb) thumb.innerHTML = `<img src="${entry.thumb}" alt="">`;
      else thumb.textContent = (entry.file.name.split('.').pop() ?? '').slice(0, 4).toUpperCase();
      const info = document.createElement('div');
      info.className = 'info';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = entry.file.name;
      name.title = entry.file.name;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = formatBytes(entry.file.size);
      info.append(name, meta);
      const actions = document.createElement('div');
      actions.className = 'actions';
      if (reorder && files.length > 1) {
        actions.append(iconButton('↑', 'Move up', () => move(entry.id, -1), i === 0));
        actions.append(iconButton('↓', 'Move down', () => move(entry.id, 1), i === files.length - 1));
      }
      actions.append(iconButton('×', `Remove ${entry.file.name}`, () => remove(entry.id)));
      li.append(thumb, info, actions);
      list.append(li);
    }
    run.disabled = files.length === 0 || busy;
    clear.hidden = files.length === 0;
    drop.classList.toggle('is-compact', files.length > 0);
    root.dataset.count = String(files.length);
  }

  function iconButton(text: string, label: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-icon btn-ghost';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  function showError(message: string) {
    error.textContent = message;
    error.classList.add('is-active');
  }
  function hideError() {
    error.classList.remove('is-active');
    error.textContent = '';
  }
  function hideResults() {
    results.classList.remove('is-active');
    const next = document.getElementById('next-steps');
    if (next) next.hidden = true;
    resultsList.innerHTML = '';
    for (const o of outputs) if (o.previewUrl) URL.revokeObjectURL(o.previewUrl);
    outputs = [];
  }

  const progressApi: Progress = {
    set(text, fraction) {
      progressText.textContent = text;
      progressBar.style.width = fraction === undefined ? '0%' : `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
    },
  };

  function setBusy(b: boolean) {
    busy = b;
    run.disabled = b || files.length === 0;
    progress.classList.toggle('is-active', b);
    root.classList.toggle('is-busy', b);
    if (!b) progressApi.set('', 0);
  }

  function showResults(outs: OutputFile[]) {
    outputs = outs;
    resultsList.innerHTML = '';
    resultsTitle.textContent = opts.resultsTitle?.(outs) ?? (outs.length === 1 ? 'Done' : `Done: ${outs.length} files`);
    let totalIn = 0;
    let totalOut = 0;
    for (const o of outs) {
      const row = document.createElement('div');
      row.className = 'result-item';
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (o.previewUrl) thumb.innerHTML = `<img src="${o.previewUrl}" alt="">`;
      else thumb.textContent = o.badge ?? (o.name.split('.').pop() ?? '').slice(0, 4).toUpperCase();
      const info = document.createElement('div');
      info.className = 'info';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = o.name;
      name.title = o.name;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = formatBytes(o.blob.size);
      if (o.originalSize !== undefined && o.originalSize > 0) {
        totalIn += o.originalSize;
        totalOut += o.blob.size;
        const pct = Math.round((1 - o.blob.size / o.originalSize) * 100);
        const span = document.createElement('span');
        span.className = pct >= 0 ? 'saving' : 'grew';
        span.textContent = pct >= 0 ? ` · ${pct}% smaller` : ` · ${-pct}% larger`;
        meta.append(span);
      }
      if (o.note) {
        const n = document.createElement('span');
        n.textContent = ` · ${o.note}`;
        meta.append(n);
      }
      info.append(name, meta);
      const actions = document.createElement('div');
      actions.className = 'actions';
      const dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'btn btn-sm';
      dl.textContent = 'Download';
      dl.addEventListener('click', () => downloadBlob(o.blob, o.name));
      if (o.text !== undefined) {
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'btn btn-sm btn-primary';
        copy.textContent = 'Copy text';
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(o.text!);
            copy.textContent = 'Copied';
          } catch {
            // Clipboard blocked (an insecure context, or permission denied): select it for Ctrl+C instead.
            area.select();
            copy.textContent = 'Press Ctrl+C';
          }
          setTimeout(() => (copy.textContent = 'Copy text'), 2000);
        });
        actions.prepend(copy);
      }
      const area = document.createElement('textarea');
      actions.append(dl);
      row.append(thumb, info, actions);
      if (o.text !== undefined) {
        area.className = 'result-text';
        area.readOnly = true;
        area.value = o.text;
        area.rows = Math.min(14, Math.max(3, o.text.split('\n').length + 1));
        area.setAttribute('aria-label', `Text read from ${o.name}`);
        row.append(area);
      }
      resultsList.append(row);
    }
    if (outs.length > 1 && totalIn > 0) {
      resultsTitle.textContent += ` · ${formatBytes(totalIn)} → ${formatBytes(totalOut)}`;
    }
    downloadAll.hidden = outs.length < 2;
    results.classList.add('is-active');
    results.dataset.count = String(outs.length);
    if (outs.length === 1 && (opts.autoDownloadSingle ?? true)) downloadBlob(outs[0]!.blob, outs[0]!.name);
    // The run bar is pinned to the screen, so the results can land out of sight below it.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    results.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }

  /** A line above the run button saying what is still needed before Run (empty hides it). */
  function setHint(text = '') {
    hint.textContent = text;
    hint.hidden = !text;
  }

  async function execute() {
    if (busy || files.length === 0) return;
    hideError();
    hideResults();
    setBusy(true);
    progressApi.set('Preparing…', 0);
    const started = performance.now();
    const inputBytes = files.reduce((n, f) => n + f.file.size, 0);
    const tool = root.dataset.slug ?? 'unknown';
    try {
      const result = await opts.process(files, progressApi);
      const outs = Array.isArray(result) ? result : result.outputs;
      const skipped = Array.isArray(result) ? [] : result.skipped;
      if (outs.length === 0) throw new Error('Nothing was produced. Check the options and try again.');
      showResults(outs);
      const firstOk = !!attempt && !attempt.ok;
      if (attempt) attempt.ok = true;
      if (skipped.length > 0) {
        const list = skipped
          .slice(0, 5)
          .map((s) => `${s.name} (${s.reason.replace(/\.$/, '')})`)
          .join('; ');
        showError(`${skipped.length} of ${files.length} files ${skipped.length === 1 ? 'was' : 'were'} skipped: ${list}${skipped.length > 5 ? '; …' : ''}.`);
      }
      trackToolRun({ tool, outcome: 'ok', firstOk, files: files.length, inputBytes, outputBytes: outs.reduce((n, o) => n + o.blob.size, 0), ms: performance.now() - started, format: opts.outputFormat?.() });
      root.dispatchEvent(new CustomEvent('stayput:done'));
    } catch (e) {
      console.error(e);
      showError(e instanceof Error ? e.message : String(e));
      trackToolRun({ tool, outcome: 'error', files: files.length, inputBytes, ms: performance.now() - started, format: opts.outputFormat?.(), errorClass: classifyError(e) });
    } finally {
      setBusy(false);
    }
  }

  function dropped(dt: DataTransfer) {
    const walking = opts.folders ? droppedFiles(dt) : undefined;
    if (!walking) return void addFiles(dt.files);
    walking.then(addFiles, (e) => showError(`That folder could not be read: ${e instanceof Error ? e.message : String(e)}`));
  }

  // Wiring
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    if (input.files) void addFiles(input.files);
    input.value = '';
  });
  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('is-over');
    });
  }
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    if (e.dataTransfer) dropped(e.dataTransfer);
  });
  // Allow dropping anywhere on the page.
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    if (drop.contains(e.target as Node)) return;
    e.preventDefault();
    if (e.dataTransfer?.files?.length) dropped(e.dataTransfer);
  });
  // Paste images from the clipboard.
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.files;
    if (items?.length) void addFiles(items);
  });
  run.addEventListener('click', () => void execute());
  clear.addEventListener('click', () => {
    files = [];
    attempt = undefined;
    setHint();
    hideResults();
    hideError();
    render();
    void filesChanged();
  });
  downloadAll.addEventListener('click', async () => {
    downloadAll.disabled = true;
    try {
      const zip = await zipFiles(outputs);
      downloadBlob(zip, `${root.dataset.slug ?? 'stayput'}-${Date.now()}.zip`);
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      downloadAll.disabled = false;
    }
  });
  // Re-running with the same files should be possible after changing options.
  document.getElementById('options')?.addEventListener('change', () => hideResults());

  render();
  mountNetProof(root);
  mountInstallPrompt(root);
  mountNextSteps(root);
  warmDecoders(input.accept);
  // Landing pages load the tool module on demand; this marks the shell as live.
  root.dataset.ready = 'true';

  return {
    get files() {
      return files;
    },
    execute,
    showError,
    hideError,
    setHint,
    progress: progressApi,
    /** Expose for tests. */
    addFiles,
  };
}

export type Shell = ReturnType<typeof createShell>;
