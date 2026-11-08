import { bool, createShell, num, radio, str } from '../lib/shell';
import { retryNote } from '../lib/edit-recovery';
import { formatBytes, type OutputFile } from '../lib/files';
import { overPhoneLimit } from '../lib/phone-limit';
import { planFor, readDuration, videoPartName, type VideoPart } from '../lib/video-split';
import { InputError } from '../lib/input-error';
import { nameBare } from '../lib/bare-error';
import { lazyImport, warm } from '../lib/lazy-import';
import { isNotReadable, noteEarlyCopy, probeReadable, snapshotFile } from '../lib/read-failure';
import { lostCut } from '../lib/working-size';

/**
 * Video splitter. The length is read from the file's container; the parts are
 * planned in seconds and cut one at a time by src/lib/video-trim.ts, loaded on
 * demand, then packed into a zip by the shell. Nothing leaves the tab.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const info = $('vs-info');
const list = $<HTMLOListElement>('vs-parts');
const timesField = $('vs-times-field');
const everyField = $('vs-every-field');
const equalField = $('vs-equal-field');

let duration = 0;
let fileSize = 0;
let loading: Promise<void> | undefined;
/** The picked file copied into memory (up to 50 MB), so a phone that lets go of it later cannot fail a cut. */
let held: { picked: File; copy: Promise<File> } | undefined;

/**
 * Parts already cut for the file in `held`, by their place in the plan. A run the hidden page cut short starts again from the
 * top (see resumeIfHidden in wake-lock.ts); the parts it had finished are used again, so the second go cuts only what is left.
 * Each is a file on this device (or a blob in memory), cleared when the file changes or the run finishes.
 */
let finished = new Map<string, OutputFile>();

/** The file to work from: the in-memory copy of the pick when there is one, else the pick itself. */
function workFile(picked: File): Promise<File> {
  if (held?.picked !== picked) {
    held = { picked, copy: snapshotFile(picked) };
    noteEarlyCopy(picked, held.copy);
  }
  // A failed copy is dropped, so the next call reads the file again.
  held.copy.catch(() => (held = held?.picked === picked ? undefined : held));
  return held.copy;
}

/**
 * Runs `job` and, if the phone fails to read the file, reads it up to twice more (after 1 s, then 2.5 s): three reads in
 * all. A video over the 50 MB copy limit is read from the phone's storage on every cut, so a read can fail more than once
 * in a row. A file that is still unreadable ends as NotReadableError with the save-to-phone message, as before.
 */
async function rereading<T>(file: Blob, job: () => Promise<T>, onNotice?: (message: string) => void): Promise<T> {
  for (const pause of [1000, 2500]) {
    try {
      return await job();
    } catch (e) {
      if (!isNotReadable(e)) throw e;
      await new Promise((r) => setTimeout(r, pause));
      await probeReadable(file);
      onNotice?.('The file could not be read. Trying again.');
    }
  }
  return job();
}

/**
 * The cutting code, loaded on first use. A chunk that is gone after a deploy is AppUpdated with a Reload link (retrying
 * cannot help: the browser remembers a failed import by URL). Any other load error is named CutToolLoadFailed.
 */
async function loadCutTool(): Promise<typeof import('../lib/video-trim')> {
  try {
    return await lazyImport(() => import('../lib/video-trim'));
  } catch (e) {
    throw nameBare('CutToolLoadFailed', e);
  }
}

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};
const mode = () => {
  const m = radio('vs-mode', 'times');
  return m === 'every' || m === 'equal' ? m : 'times';
};

/** The parts the current settings make; throws a named error that says what to fix. */
function plan(): VideoPart[] {
  return planFor({ mode: mode(), times: str('vs-times'), everySeconds: num('vs-every', 0) * num('vs-unit', 1), parts: num('vs-equal', 0) }, duration);
}

const runButton = $<HTMLButtonElement>('run');
let guarding = false;

/**
 * Keeps Run off while the cut list is bad, so a run never starts on a bad plan. A video whose length could not be read
 * is not held back: Run reads it again and a failure is recorded under its own name.
 */
function guardRun() {
  let good = true;
  if (duration > 0) {
    try {
      plan();
    } catch {
      good = false;
    }
  }
  if (!good) {
    if (!runButton.disabled) runButton.disabled = true;
    guarding = true;
  } else if (guarding) {
    guarding = false;
    // The shell keeps Run off while it is working and while no file is chosen.
    runButton.disabled = $('tool').classList.contains('is-busy') || $('tool').dataset.count === '0';
  }
}
// The shell turns Run on again when a run ends or files change: put the guard back at once.
new MutationObserver(guardRun).observe(runButton, { attributes: true, attributeFilter: ['disabled'] });

function update() {
  timesField.hidden = mode() !== 'times';
  everyField.hidden = mode() !== 'every';
  equalField.hidden = mode() !== 'equal';
  list.hidden = true;
  list.textContent = '';
  info.classList.remove('is-over');
  delete $('tool').dataset.parts;
  guardRun();
  if (!duration) {
    info.textContent = '';
    return;
  }
  const head = `${clock(duration)} long.`;
  if (mode() === 'times' && !str('vs-times').trim()) {
    info.textContent = `${head} Type the times where each new part should start.`;
    return;
  }
  try {
    const parts = plan();
    // Parts are copied or re-encoded at about the input's bitrate, so together they come to about the input's size.
    const size = fileSize ? `, about ${formatBytes(fileSize)} in total` : '';
    const phone = overPhoneLimit(fileSize) ? ' This is a big file for a phone, which may run out of memory: split it on a computer, or into fewer parts.' : '';
    info.textContent = `${head} ${parts.length} ${parts.length === 1 ? 'part' : 'parts'}${size}.${phone}`;
    $('tool').dataset.parts = String(parts.length);
    for (const p of parts) {
      const li = document.createElement('li');
      li.textContent = `${clock(p.start)} to ${clock(p.end)} (${clock(p.end - p.start)})`;
      list.append(li);
    }
    list.hidden = false;
  } catch (e) {
    info.classList.add('is-over');
    info.textContent = e instanceof Error ? e.message : String(e);
  }
}

async function load(file: File, onNotice?: (message: string) => void) {
  duration = 0;
  fileSize = file.size;
  update();
  // A phone that could not read the file the first time often can on the second.
  duration = await rereading(file, () => readDuration(file), onNotice);
  $('tool').dataset.duration = String(Math.round(duration * 10) / 10);
  update();
}

for (const el of document.querySelectorAll('input[name="vs-mode"], #vs-times, #vs-every, #vs-unit, #vs-equal')) {
  el.addEventListener('input', update);
  el.addEventListener('change', update);
}

const shell = createShell({
  keepAwake: true,
  remembersSize: true,
  async onFilesChanged(files) {
    // Fetch the cutting code at drop time, while the deployment that served this page is most likely still current.
    if (files.length > 0) warm(() => import('../lib/video-trim'));
    if (files.length === 0) {
      duration = 0;
      fileSize = 0;
      held = undefined;
      finished = new Map();
      delete $('tool').dataset.duration;
      return update();
    }
    finished = new Map();
    loading = workFile(files[0]!.file).then((f) => load(f)).catch((e) => {
      duration = 0;
      update();
      shell.showError(e instanceof Error ? e.message : String(e));
    });
    await loading;
  },
  async process(files, progress) {
    const entry = files[0]!;
    await loading;
    const file = await workFile(entry.file).catch((e) => {
      throw nameBare('VideoReadFailed', e);
    });
    if (!duration) {
      try {
        await load(file, (m) => progress.set(m, 0));
      } catch (e) {
        throw nameBare('VideoReadFailed', e);
      }
    }
    let parts: VideoPart[];
    try {
      parts = plan();
    } catch (e) {
      // Run is kept off for a bad list, so this is only a press that got past that: the person's input, not a failure.
      throw new InputError(e instanceof Error ? e.message : 'Check the times and try again.');
    }
    // After the browser closed this page mid-split (an iPhone short of memory), every part is copied from its key frame: nothing is decoded or re-encoded.
    const careful = lostCut();
    const exact = bool('exact') && !careful;
    if (careful) progress.set('The browser closed this page during the last split, so each part is copied from the key frame at or before its start. That uses far less memory.', 0);
    // The cutting code loads on first use (and is warmed when the file is added).
    const { trimVideo } = await loadCutTool();
    const outs: OutputFile[] = [];
    for (const [i, part] of parts.entries()) {
      const label = `Part ${i + 1} of ${parts.length}`;
      progress.set(label, i / parts.length);
      const key = `${exact}|${careful}|${parts.length}|${part.start}|${part.end}`;
      const done = finished.get(key);
      if (done) {
        outs.push(done);
        continue;
      }
      // One part at a time: only the finished file is kept.
      const r = await rereading(
        file,
        () =>
          trimVideo(file, {
            start: part.start,
            end: part.end,
            exact,
            mute: false,
            copyOnly: careful,
            onProgress: (f) => progress.set(`${label}: ${Math.round(f * 100)}%`, (i + f) / parts.length),
            onNotice: (m) => progress.set(`${label}: ${m}`, i / parts.length),
          }),
        (m) => progress.set(`${label}: ${m}`, i / parts.length),
      );
      const out: OutputFile = {
        name: videoPartName(entry.file.name, i, parts.length, r.ext),
        blob: r.blob,
        note: `${clock(part.start)} to ${clock(part.end)}, ${exact ? 'cut exactly' : r.keyframeCopy ? 'copied from the key frame at or before the start' : 'fast cut'}${retryNote(r.retry, r.width && r.height ? { width: r.width, height: r.height } : undefined)}`,
      };
      finished.set(`${key}`, out);
      outs.push(out);
    }
    finished = new Map();
    return outs;
  },
});
