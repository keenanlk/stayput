import { createShell, num, radio, str } from '../lib/shell';
import { type OutputFile } from '../lib/files';
import { channelsOf, decodeAudio, encodeMp3, encodeWav, SAMPLE_RATE } from '../lib/audio';
import { cutPart, parseTimes, partName, planAtTimes, planEvery, SplitError, type Part } from '../lib/audio-split';
import { NamedError } from '../lib/input-error';
import { nameBare } from '../lib/bare-error';
import { retryUnreadable } from '../lib/read-failure';

/**
 * Audio splitter. The file is decoded in the page, cut into parts at the times
 * typed or every so often, and each part is written as MP3 or WAV. The parts
 * abut exactly, with no fades. Nothing leaves the tab.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const info = $('sp-info');
const list = $<HTMLOListElement>('sp-parts');
const timesField = $('sp-times-field');
const everyField = $('sp-every-field');

/**
 * A RangeError while the sound is decoded, cut or encoded is a length or an allocation that did not fit (the split points are
 * checked before this, by plan()). It reaches a failed run's record as plain "RangeError", so it is named OutOfMemoryError and
 * says what to do; any other bare error is named for the step.
 */
function named(step: string, e: unknown): Error {
  if (!(e instanceof RangeError)) return nameBare(step, e);
  return new NamedError('OutOfMemoryError', 'This device ran out of memory while working on this sound. Close other tabs and apps and try again, use a shorter file or shorter parts, choose MP3 instead of WAV, or use a computer.', { cause: e });
}

let buffer: AudioBuffer | undefined;
let loading: Promise<void> | undefined;

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};
const mode = () => (radio('sp-mode', 'times') === 'every' ? 'every' : 'times');
const format = () => (str('format', 'mp3') === 'wav' ? 'wav' : 'mp3');

/** The parts the current settings make; throws a SplitError that says what to fix. */
function plan(): Part[] {
  if (!buffer) throw new SplitError('No sound could be read from this file.');
  const total = buffer.length;
  if (mode() === 'every') return planEvery(num('sp-every', 0) * num('sp-unit', 60), total, buffer.sampleRate);
  return planAtTimes(parseTimes(str('sp-times')), total, buffer.sampleRate);
}

function update() {
  timesField.hidden = mode() !== 'times';
  everyField.hidden = mode() !== 'every';
  list.hidden = true;
  list.textContent = '';
  info.classList.remove('is-over');
  if (!buffer) {
    info.textContent = '';
    return;
  }
  const rate = buffer.sampleRate;
  const head = `${clock(buffer.length / rate)} long.`;
  if (mode() === 'times' && !str('sp-times').trim()) {
    info.textContent = `${head} Type the times where each new part should start.`;
    return;
  }
  try {
    const parts = plan();
    info.textContent = `${head} ${parts.length} ${parts.length === 1 ? 'part' : 'parts'}:`;
    for (const p of parts) {
      const li = document.createElement('li');
      li.textContent = `${clock(p.from / rate)} to ${clock(p.to / rate)} (${clock((p.to - p.from) / rate)})`;
      list.append(li);
    }
    list.hidden = false;
  } catch (e) {
    info.classList.add('is-over');
    info.textContent = e instanceof Error ? e.message : String(e);
  }
}

async function load(file: File) {
  buffer = undefined;
  update();
  buffer = await retryUnreadable(file, () => decodeAudio(file)).catch((e) => {
    throw named('AudioDecodeError', e);
  });
  $('tool').dataset.duration = String(Math.round(buffer.duration * 10) / 10);
  update();
}

for (const el of document.querySelectorAll('input[name="sp-mode"], #sp-times, #sp-every, #sp-unit')) {
  el.addEventListener('input', update);
  el.addEventListener('change', update);
}

const shell = createShell({
  outputFormat: format,
  async onFilesChanged(files) {
    if (files.length === 0) {
      buffer = undefined;
      return update();
    }
    loading = load(files[0]!.file).catch((e) => {
      buffer = undefined;
      update();
      shell.showError(e instanceof Error ? e.message : String(e));
    });
    await loading;
  },
  async process(files, progress) {
    const entry = files[0]!;
    await loading;
    if (!buffer) await load(entry.file);
    if (!buffer || !buffer.length) throw new NamedError('AudioSplitterFailed', 'No sound could be read from this file.');
    const parts = plan();
    const chans = channelsOf(buffer, false);
    const fmt = format();
    const outs: OutputFile[] = [];
    for (const [i, part] of parts.entries()) {
      const label = `Part ${i + 1} of ${parts.length}`;
      progress.set(label, i / parts.length);
      // One part at a time: only the finished file is kept.
      const blob = await (async () => {
        const cut = cutPart(chans, SAMPLE_RATE, part);
        return fmt === 'wav'
          ? encodeWav(cut)
          : encodeMp3(cut, 192, (f) => progress.set(`${label}: encoding MP3 ${Math.round(f * 100)}%`, (i + f) / parts.length));
      })().catch((e) => {
        throw named('AudioSplitFailed', e);
      });
      outs.push({
        name: partName(entry.file.name, i, parts.length, fmt),
        blob,
        note: [`${clock(part.from / SAMPLE_RATE)} to ${clock(part.to / SAMPLE_RATE)}`, fmt === 'wav' ? '16-bit WAV' : '192 kbps MP3'].join(', '),
      });
    }
    return outs;
  },
});
