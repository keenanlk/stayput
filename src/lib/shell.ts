/**
 * Shared runtime for every tool page: drop zone, file list, options, run
 * button, progress, results and downloads. Tool scripts plug in a `process`
 * function and read their options through the helpers below.
 */
import { downloadBlob, formatBytes, zipFiles, type OutputFile } from './files';
import { trackToolRun } from './analytics';
import { mountNetProof } from './netproof';
import { mountInstallPrompt } from './install';

export interface ShellFile {
  id: number;
  file: File;
  thumb?: string;
}

export interface Progress {
  set(text: string, fraction?: number): void;
}

export interface ShellOptions {
  /** Produce a preview URL for a file in the list (optional). */
  thumbnail?: (file: File) => Promise<string | undefined>;
  /** Allow reordering with arrows. Default true when multiple. */
  reorder?: boolean;
  /** Called after files are added, removed or reordered. */
  onFilesChanged?: (files: ShellFile[]) => void | Promise<void>;
  /** Do the work. Return the outputs to show. */
  process: (files: ShellFile[], progress: Progress) => Promise<OutputFile[]>;
  /** Title shown above the results. */
  resultsTitle?: (outputs: OutputFile[]) => string;
  /** Automatically download when there is exactly one output. Default true. */
  autoDownloadSingle?: boolean;
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
  const results = $('results');
  const resultsList = $('results-list');
  const resultsTitle = $('results-title');
  const downloadAll = $<HTMLButtonElement>('download-all');

  let files: ShellFile[] = [];
  let nextId = 1;
  let outputs: OutputFile[] = [];
  let busy = false;

  const isImage = (f: File) => f.type.startsWith('image/') || /\.(heic|heif|avif|jxl)$/i.test(f.name);

  async function addFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming).filter((f) => f.size > 0);
    if (arr.length === 0) return;
    if (!multiple) files = [];
    for (const file of arr) {
      const entry: ShellFile = { id: nextId++, file };
      files.push(entry);
      if (!multiple) break;
    }
    hideResults();
    hideError();
    render();
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
    root.dataset.inputBytes = String(files.reduce((n, f) => n + f.file.size, 0));
    root.dispatchEvent(new CustomEvent('stayput:files'));
    await opts.onFilesChanged?.(files);
  }

  function remove(id: number) {
    files = files.filter((f) => f.id !== id);
    hideResults();
    render();
    void opts.onFilesChanged?.(files);
  }

  function move(id: number, delta: number) {
    const i = files.findIndex((f) => f.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= files.length) return;
    const [item] = files.splice(i, 1);
    files.splice(j, 0, item!);
    hideResults();
    render();
    void opts.onFilesChanged?.(files);
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
      else thumb.textContent = (o.name.split('.').pop() ?? '').slice(0, 4).toUpperCase();
      const info = document.createElement('div');
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
      actions.append(dl);
      row.append(thumb, info, actions);
      resultsList.append(row);
    }
    if (outs.length > 1 && totalIn > 0) {
      resultsTitle.textContent += ` · ${formatBytes(totalIn)} → ${formatBytes(totalOut)}`;
    }
    downloadAll.hidden = outs.length < 2;
    results.classList.add('is-active');
    results.dataset.count = String(outs.length);
    if (outs.length === 1 && (opts.autoDownloadSingle ?? true)) downloadBlob(outs[0]!.blob, outs[0]!.name);
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
      const outs = await opts.process(files, progressApi);
      if (outs.length === 0) throw new Error('Nothing was produced. Check the options and try again.');
      showResults(outs);
      trackToolRun({ tool, outcome: 'ok', files: files.length, inputBytes, outputBytes: outs.reduce((n, o) => n + o.blob.size, 0), ms: performance.now() - started });
      root.dispatchEvent(new CustomEvent('stayput:done'));
    } catch (e) {
      console.error(e);
      showError(e instanceof Error ? e.message : String(e));
      trackToolRun({ tool, outcome: 'error', files: files.length, inputBytes, ms: performance.now() - started });
    } finally {
      setBusy(false);
    }
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
    if (e.dataTransfer?.files) void addFiles(e.dataTransfer.files);
  });
  // Allow dropping anywhere on the page.
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    if (drop.contains(e.target as Node)) return;
    e.preventDefault();
    if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files);
  });
  // Paste images from the clipboard.
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.files;
    if (items?.length) void addFiles(items);
  });
  run.addEventListener('click', () => void execute());
  clear.addEventListener('click', () => {
    files = [];
    hideResults();
    hideError();
    render();
    void opts.onFilesChanged?.(files);
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

  return {
    get files() {
      return files;
    },
    execute,
    showError,
    hideError,
    progress: progressApi,
    /** Expose for tests. */
    addFiles,
  };
}

export type Shell = ReturnType<typeof createShell>;
