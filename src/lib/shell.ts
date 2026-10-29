/**
 * Shared runtime for every tool page: drop zone, file list, options, run
 * button, progress, results and downloads. Tool scripts plug in a `process`
 * function and read their options through the helpers below.
 */
import { downloadBlob, formatBytes, zipFiles, type OutputFile } from './files';
import { classifyError, trackFilesAdded, trackToolRun, trackToolStart } from './analytics';
import { EncoderStall } from './encoder-watchdog';
import { mountNetProof } from './netproof';
import { mountInstallPrompt } from './install';
import { mountNextSteps } from './next-steps';
import { mountDesktopTeaser } from './desktop-teaser';
import { warmDecoders } from './vendor';
import { droppedFiles } from './folder-drop';
import { takeHandoff } from './handoff';
import { releaseOutput } from './opfs-output';
import { guardRun, interruptedError, resumeIfHidden, KEEP_SCREEN_ON_HINT } from './wake-lock';
import { isIosBrowser, isPhoneBrowser } from './phone-limit';
import { NamedError } from './input-error';
import { failsTheSameAgain } from './edit-recovery';
import { inspectFile, type IntakeProblem } from './intake';
import { forgetWorkingSize, workingSize } from './working-size';

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
const EXT_TYPE: Record<string, string> = { txt: 'text', srt: 'text', vtt: 'text', json: 'application', csv: 'text', md: 'text', pdf: 'application', svg: 'image' };

/** The top-level media type of a file ("image", "audio", "video", "text"…), from its type or else its extension; '' when unknown. */
function topType(f: Blob & { name?: string }): string {
  if (f.type) {
    // JSON, like SRT and VTT, is text-like output when it comes from media.
    return f.type === 'application/json' ? 'text' : f.type.split('/')[0]!;
  }
  const ext = f.name?.split('.').pop()?.toLowerCase() ?? '';
  const t = EXT_TYPE[ext] ?? '';
  return t === 'application' && ext === 'json' ? 'text' : t;
}

/** True when the output is a different kind of thing than every input (audio to text, video to image…), so a size comparison means nothing. Unknown types keep the comparison. */
function changesKind(out: Blob & { name?: string }, inputKinds: Set<string>): boolean {
  const kind = topType(out);
  return kind !== '' && inputKinds.size > 0 && !inputKinds.has(kind);
}

export type ProcessResult = OutputFile[] | { outputs: OutputFile[]; skipped: Skipped[] };

export interface ShellOptions {
  /** Produce a preview URL for a file in the list (optional). */
  thumbnail?: (file: File) => Promise<string | undefined>;
  /** Allow reordering with arrows. Default true when multiple. */
  reorder?: boolean;
  /** Called after files are added, removed or reordered. */
  onFilesChanged?: (files: ShellFile[]) => void | Promise<void>;
  /**
   * Keeps Run disabled while the list can't be run, and shows the returned
   * one-line reason above Run. Return '' when the list is fine. Evaluated on
   * every list change and on shell.refresh().
   */
  runBlocker?: (files: ShellFile[]) => string;
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
  /** A long video job: keep the screen on while it runs, and say so if the page was hidden when it failed. */
  keepAwake?: boolean;
  /** Send one tool_start event when Run is pressed (the caption tools, where phones abandon runs). */
  announceStart?: boolean;
  /** A video job that starts at the smaller size that last worked in this tab (see edit-recovery.ts): says so, and offers "Try full size". */
  remembersSize?: boolean;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new NamedError('ShellFailed', `Missing element #${id}`);
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
/** A long file name cut in the middle, keeping its start and its extension: "IMG_20241012_1830…4821.mov". */
export function shortName(name: string, max = 26): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : '';
  const base = ext ? name.slice(0, dot) : name;
  const room = Math.max(8, max - ext.length - 1);
  const tail = Math.min(4, Math.floor(room / 3));
  return `${base.slice(0, room - tail)}…${base.slice(base.length - tail)}${ext}`;
}

/** The line under a failed run that cannot be repeated: the reason as the person was told it, and what to change. */
function repeatHint(e: unknown): string {
  const reason = (e instanceof Error ? e.message : String(e)).trim().replace(/[.\s]+$/, '');
  return `${reason}. To try again, change the file or an option.`;
}

export function describeError(file: File, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.startsWith(file.name) ? msg : `${file.name}: ${msg}`;
}

/** The same message tools have always shown (prefixed with the file name), carrying the original error's class name so analytics can tell failures apart. */
function rewrap(file: File, e: unknown): Error {
  const out = new NamedError('ShellFailed', describeError(file, e));
  if (e instanceof Error && e.name) out.name = e.name;
  const link = (e as { link?: { href: string; text: string } } | null)?.link;
  if (link) (out as Error & { link?: typeof link }).link = link;
  const stage = (e as { stage?: string } | null)?.stage;
  if (stage) (out as Error & { stage?: string }).stage = stage;
  // Work the failed step finished (a partial transcript) stays downloadable.
  const salvage = (e as { salvage?: OutputFile[] } | null)?.salvage;
  if (salvage) (out as Error & { salvage?: OutputFile[] }).salvage = salvage;
  return out;
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
  if (outputs.length === 0 && skipped.length > 0) throw firstError instanceof EncoderStall ? firstError : rewrap(files[0]!.file, firstError);
  progress.set('Done', 1);
  return { outputs, skipped };
}

export function createShell(opts: ShellOptions) {
  const root = $('tool');
  const multiple = root.dataset.multiple === 'true';
  const reorder = opts.reorder ?? multiple;
  const drop = $('drop');
  const iosNote = document.getElementById('ios-picker-note');
  if (iosNote && isIosBrowser()) iosNote.hidden = false;
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
  const desktopTeaser = mountDesktopTeaser(root);
  const downloadAll = $<HTMLButtonElement>('download-all');

  let files: ShellFile[] = [];
  let nextId = 1;
  let outputs: OutputFile[] = [];
  let busy = false;
  let guard: ReturnType<typeof guardRun> | undefined;
  // An attempt starts when files are added and ends at a clear or when new
  // files arrive after a successful run. files_added fires once per attempt, and
  // tool_run marks the attempt's first success, so completion = first successes / files_added.
  let attempt: { ok: boolean } | undefined;
  // The file carried over from the previous tool, while it is still in the list (see adoptHandoff).
  let carriedFile: File | undefined;

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
    repeatBlock = '';
    if (!multiple) files = [];
    for (const file of arr) {
      const entry: ShellFile = { id: nextId++, file };
      files.push(entry);
      if (!multiple) break;
    }
    render();
    const added = files.filter((f) => !intake.has(f.id));
    checking = Promise.all(added.map(async (f) => intake.set(f.id, (await inspectFile(f.file, root.dataset.slug ?? '', root.dataset.base ?? '', input.accept).catch(() => null)) ?? undefined))).then(updateRunBlock);
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
    repeatBlock = '';
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
    repeatBlock = '';
    hideResults();
    render();
    void filesChanged();
  }

  // What the file-intake check found for each picked file (see intake.ts); a file with a problem keeps Run disabled.
  const intake = new Map<number, IntakeProblem | undefined>();
  let checking: Promise<void> = Promise.resolve();
  const intakeProblem = () => files.map((f) => intake.get(f.id)).find(Boolean);

  let runBlock = '';
  // Set when a run failed in a way the same file and options will repeat; any change to the files or an option clears it.
  let repeatBlock = '';
  function unlockRepeat() {
    if (!repeatBlock) return;
    repeatBlock = '';
    updateRunBlock();
  }
  function updateRunBlock() {
    const found = intakeProblem();
    const next = opts.runBlocker?.(files) || found?.message || repeatBlock;
    if (next !== runBlock) {
      runBlock = next;
      setHint(next, next === found?.message ? found?.link : undefined);
      hint.dataset.problem = next === found?.message ? found?.name ?? '' : '';
    }
    run.disabled = files.length === 0 || busy || !!runBlock;
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
    updateRunBlock();
    clear.hidden = files.length === 0;
    drop.classList.toggle('is-compact', files.length > 0);
    root.dataset.count = String(files.length);
    if (carriedFile && !files.some((f) => f.file === carriedFile)) {
      carriedFile = undefined;
      document.getElementById('handoff-note')?.remove();
    }
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

  function showError(message: string, link?: { href: string; text: string }) {
    error.textContent = message;
    if (link) {
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.text;
      error.append(' ', a);
    }
    error.classList.add('is-active');
  }
  function hideError() {
    error.classList.remove('is-active');
    error.textContent = '';
  }
  function hideResults() {
    results.classList.remove('is-active');
    desktopTeaser.hide();
    const next = document.getElementById('next-steps');
    if (next) next.hidden = true;
    resultsList.innerHTML = '';
    for (const o of outputs) {
      if (o.previewUrl) URL.revokeObjectURL(o.previewUrl);
      // A video written to a temporary file on this device: delete the file (no-op for anything in memory).
      void releaseOutput(o.blob);
    }
    outputs = [];
  }

  const progressApi: Progress = {
    set(text, fraction) {
      // Tool scripts put the file's own name in the message; a long one would fill the line, so show a short form
      // (the full line stays in the title, which only ever shows on this device).
      let short = text;
      for (const { file } of [...files].sort((a, b) => b.file.name.length - a.file.name.length)) {
        if (file.name.length > 26) short = short.split(file.name).join(shortName(file.name));
      }
      progressText.textContent = short;
      progressText.title = short === text ? '' : text;
      progressBar.style.width = fraction === undefined ? '0%' : `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
    },
  };

  function setBusy(b: boolean) {
    busy = b;
    run.disabled = b || files.length === 0 || !!runBlock;
    progress.classList.toggle('is-active', b);
    root.classList.toggle('is-busy', b);
    if (!b) progressApi.set('', 0);
  }

  function showResults(outs: OutputFile[], autoDownload = true) {
    outputs = outs;
    resultsList.innerHTML = '';
    resultsTitle.textContent = opts.resultsTitle?.(outs) ?? (outs.length === 1 ? 'Done' : `Done: ${outs.length} files`);
    let totalIn = 0;
    let totalOut = 0;
    const inputKinds = new Set(files.map((f) => topType(f.file)).filter(Boolean));
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
      if (o.originalSize !== undefined && o.originalSize > 0 && !changesKind(o.blob, inputKinds)) {
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
    if (autoDownload && outs.length === 1 && (opts.autoDownloadSingle ?? true)) downloadBlob(outs[0]!.blob, outs[0]!.name);
    // The run bar is pinned to the screen, so the results can land out of sight below it.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    results.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }

  /** A line above the run button saying what is still needed before Run (empty hides it). */
  function setHint(text = '', link?: { text: string; href: string }) {
    const line = [text, opts.keepAwake && isPhoneBrowser() ? KEEP_SCREEN_ON_HINT : ''].filter(Boolean).join(' ');
    hint.textContent = line;
    // One phrase in the line can be a link (the warning's "Trim it first").
    const at = link ? line.indexOf(link.text) : -1;
    if (link && at >= 0) {
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.text;
      hint.textContent = line.slice(0, at);
      hint.append(a, line.slice(at + link.text.length));
    }
    hint.hidden = !line;
  }

  /** Says when this tab's runs start at a smaller size than full, and lets the person go back to full size. */
  const sizeNote = opts.remembersSize ? document.createElement('p') : null;
  function showSizeNote() {
    if (!sizeNote) return;
    const side = workingSize();
    sizeNote.hidden = !side;
    if (!side) return;
    sizeNote.className = 'hint';
    sizeNote.id = 'working-size-note';
    const name = side >= 1900 ? '1080p' : side >= 1200 ? '720p' : '480p';
    const full = document.createElement('button');
    full.type = 'button';
    full.className = 'btn btn-sm btn-ghost';
    full.textContent = 'Try full size';
    full.addEventListener('click', () => {
      forgetWorkingSize();
      showSizeNote();
    });
    sizeNote.textContent = `In this tab, videos are made at up to ${name} because the full size failed on this device earlier. `;
    sizeNote.append(full);
  }
  if (sizeNote) {
    sizeNote.hidden = true;
    hint.before(sizeNote);
    showSizeNote();
  }

  async function execute() {
    if (busy || files.length === 0) return;
    await checking;
    if (intakeProblem()) return updateRunBlock();
    hideError();
    hideResults();
    setBusy(true);
    progressApi.set('Preparing…', 0);
    const started = performance.now();
    const inputBytes = files.reduce((n, f) => n + f.file.size, 0);
    const tool = root.dataset.slug ?? 'unknown';
    const mine = (guard = opts.keepAwake ? guardRun() : undefined);
    if (opts.announceStart) trackToolStart({ tool, files: files.length, inputBytes, format: opts.outputFormat?.() });
    try {
      const result = await resumeIfHidden(
        () => opts.process(files, progressApi),
        mine,
        () => progressApi.set('The page was hidden, so the run stopped. Starting again: keep this tab open and the screen on.', 0),
      );
      const outs = Array.isArray(result) ? result : result.outputs;
      const skipped = Array.isArray(result) ? [] : result.skipped;
      if (outs.length === 0) throw new NamedError('NothingProduced', 'Nothing was produced. Check the options and try again.');
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
      root.dispatchEvent(new CustomEvent('stayput:done', { detail: outs }));
    } catch (raw) {
      const e = mine ? interruptedError(raw, mine.wasHidden(), run.textContent ?? '') : raw;
      console.error(raw);
      showError(e instanceof Error ? e.message : String(e), (e as { link?: { href: string; text: string } } | null)?.link);
      // Work finished before the failure (captions written before the video could be redrawn) stays downloadable.
      const salvage = (e as { salvage?: OutputFile[] } | null)?.salvage;
      if (salvage?.length) showResults(salvage, false);
      const errorClass = classifyError(e, tool);
      trackToolRun({ tool, outcome: 'error', files: files.length, inputBytes, ms: performance.now() - started, format: opts.outputFormat?.(), errorClass });
      if (failsTheSameAgain(errorClass)) repeatBlock = repeatHint(e);
    } finally {
      mine?.release();
      showSizeNote();
      setBusy(false);
      updateRunBlock();
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
    repeatBlock = '';
    attempt = undefined;
    // Clear while a run is going: the screen no longer needs holding for it.
    guard?.release();
    setHint(runBlock);
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
  /**
   * A file carried over from the previous tool (see handoff.ts) goes in as if it had been chosen,
   * with a line saying where it came from and a way to pick something else. Without one, nothing changes.
   */
  async function adoptHandoff() {
    const carried = await takeHandoff(input.accept);
    if (!carried) return;
    const note = document.createElement('div');
    note.className = 'handoff-note';
    note.id = 'handoff-note';
    note.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = `Using ${carried.file.name} (${formatBytes(carried.file.size)}) from ${carried.from}.`;
    const other = document.createElement('button');
    other.type = 'button';
    other.className = 'btn btn-sm btn-ghost';
    other.textContent = 'Choose a different file';
    other.addEventListener('click', () => {
      note.remove();
      clear.click();
      input.click();
    });
    note.append(text, other);
    list.before(note);
    carriedFile = carried.file;
    await addFiles([carried.file]);
  }

  // Re-running with the same files should be possible after changing options.
  document.getElementById('options')?.addEventListener('change', () => hideResults());
  // A change to an option (or anything else in the panel) re-opens Run after a failure that would only repeat.
  // The file picker, the list, Run and the results are not options: the list calls unlock itself.
  const notAnOption = '#drop, #file-list, #run-dock, #results';
  for (const ev of ['input', 'change']) {
    root.addEventListener(ev, (e) => {
      if ((e.target as HTMLElement | null)?.id !== 'file-input') unlockRepeat();
    });
  }
  // Options set by pointing (painting, a crop box) raise no input event.
  root.addEventListener('pointerdown', (e) => {
    if (repeatBlock && !(e.target as HTMLElement | null)?.closest?.(notAnOption)) unlockRepeat();
  });

  render();
  if (opts.keepAwake) setHint(runBlock);
  mountNetProof(root);
  mountInstallPrompt(root);
  mountNextSteps(root);
  warmDecoders(input.accept);
  // Landing pages load the tool module on demand; this marks the shell as live.
  root.dataset.ready = 'true';
  void adoptHandoff();

  return {
    get files() {
      return files;
    },
    execute,
    showError,
    hideError,
    setHint,
    /** Re-check opts.runBlocker after something it depends on changed (a file's kind became known). */
    refresh: updateRunBlock,
    progress: progressApi,
    /** Expose for tests. */
    addFiles,
  };
}

export type Shell = ReturnType<typeof createShell>;
