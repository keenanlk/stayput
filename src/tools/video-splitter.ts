import { bool, createShell, num, radio, str } from '../lib/shell';
import { formatBytes, type OutputFile } from '../lib/files';
import { overPhoneLimit } from '../lib/phone-limit';
import { planAtTimes, planEqual, planEvery, readDuration, videoPartName, type VideoPart } from '../lib/video-split';
import { NamedError } from '../lib/input-error';
import { nameBare } from '../lib/bare-error';
import { retryUnreadable } from '../lib/read-failure';

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
  if (!duration) throw new NamedError('SplitNoLength', 'This video has no length this page can read.');
  if (mode() === 'every') return planEvery(num('vs-every', 0) * num('vs-unit', 1), duration);
  if (mode() === 'equal') return planEqual(num('vs-equal', 0), duration);
  return planAtTimes(str('vs-times'), duration);
}

function update() {
  timesField.hidden = mode() !== 'times';
  everyField.hidden = mode() !== 'every';
  equalField.hidden = mode() !== 'equal';
  list.hidden = true;
  list.textContent = '';
  info.classList.remove('is-over');
  delete $('tool').dataset.parts;
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
  duration = await retryUnreadable(file, () => readDuration(file), onNotice);
  $('tool').dataset.duration = String(Math.round(duration * 10) / 10);
  update();
}

for (const el of document.querySelectorAll('input[name="vs-mode"], #vs-times, #vs-every, #vs-unit, #vs-equal')) {
  el.addEventListener('input', update);
  el.addEventListener('change', update);
}

const shell = createShell({
  keepAwake: true,
  async onFilesChanged(files) {
    if (files.length === 0) {
      duration = 0;
      fileSize = 0;
      delete $('tool').dataset.duration;
      return update();
    }
    loading = load(files[0]!.file).catch((e) => {
      duration = 0;
      update();
      shell.showError(e instanceof Error ? e.message : String(e));
    });
    await loading;
  },
  async process(files, progress) {
    const entry = files[0]!;
    await loading;
    if (!duration) {
      try {
        await load(entry.file, (m) => progress.set(m, 0));
      } catch (e) {
        throw nameBare('VideoReadFailed', e);
      }
    }
    const parts = plan();
    const exact = bool('exact');
    const { trimVideo } = await import('../lib/video-trim');
    const outs: OutputFile[] = [];
    for (const [i, part] of parts.entries()) {
      const label = `Part ${i + 1} of ${parts.length}`;
      progress.set(label, i / parts.length);
      // One part at a time: only the finished file is kept.
      const r = await retryUnreadable(
        entry.file,
        () =>
          trimVideo(entry.file, {
            start: part.start,
            end: part.end,
            exact,
            mute: false,
            onProgress: (f) => progress.set(`${label}: ${Math.round(f * 100)}%`, (i + f) / parts.length),
            onNotice: (m) => progress.set(`${label}: ${m}`, i / parts.length),
          }),
        (m) => progress.set(`${label}: ${m}`, i / parts.length),
      );
      outs.push({
        name: videoPartName(entry.file.name, i, parts.length, r.ext),
        blob: r.blob,
        note: `${clock(part.start)} to ${clock(part.end)}, ${exact ? 'cut exactly' : 'fast cut'}`,
      });
    }
    return outs;
  },
});
