import { createShell, num, radio, str } from '../lib/shell';
import { type OutputFile } from '../lib/files';
import '../lib/mp3-warm';
import { decodeAudio } from '../lib/audio';
import { partName, planAtTimes, planEvery, SplitError, type Part } from '../lib/audio-split';
import { parseSplitTimes } from '../lib/audio-split-times';
import { bufferSource, openStreamSource, streamAboveSeconds, type SplitSource } from '../lib/audio-split-source';
import { encodeMp3Chunks, encodeWavChunks } from '../lib/audio-split-encode';
import { NamedError } from '../lib/input-error';
import { AUDIO_COPY, stageError } from '../lib/bare-error';
import { audioSeconds, LONG_HINT_SPLITTER, LONG_SECONDS } from '../lib/long-audio';
import { isPhoneBrowser } from '../lib/phone-limit';
import { retryUnreadable } from '../lib/read-failure';

/**
 * Audio splitter. The file is decoded in the page, cut into parts at the times
 * typed or every so often, and each part is written as MP3 or WAV. The parts
 * abut exactly, with no fades. A short file is decoded whole; a long recording
 * is decoded a part at a time so it never has to fit in memory at once (see
 * audio-split-source.ts). Run stays off, with the reason shown, while the split
 * points cannot be used. Nothing leaves the tab.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const info = $('sp-info');
const list = $<HTMLOListElement>('sp-parts');
const timesField = $('sp-times-field');
const everyField = $('sp-every-field');

/**
 * A RangeError while the sound is decoded, cut or encoded is a length or an allocation that did not fit (the split points are
 * checked before this, by plan()). It reaches a failed run's record as plain "RangeError", so it is named OutOfMemoryError and
 * says what to do; any other bare error is named for the step. The splitter does not send anyone to itself.
 */
function named(step: string, e: unknown): Error {
  return stageError(step, e, { memory: AUDIO_COPY.memorySplitter, ...(step === 'AudioDecodeError' ? { message: AUDIO_COPY.read } : {}) });
}

let source: SplitSource | undefined;
let loading: Promise<void> | undefined;
let reading = false;
/** A recording an hour or longer that this phone has to decode whole (the browser could not read it a part at a time): the page says it may not fit. */
let tooLongForPhone = false;
/** Set once the shell exists: re-checks whether Run can be pressed. */
let recheckRun = () => {};

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};
const mode = () => (radio('sp-mode', 'times') === 'every' ? 'every' : 'times');
const format = () => (str('format', 'mp3') === 'wav' ? 'wav' : 'mp3');

/** The parts the current settings make; throws a SplitError that says what to fix. */
function plan(): Part[] {
  if (!source) throw new SplitError('No sound could be read from this file.');
  if (mode() === 'every') return planEvery(num('sp-every', 0) * num('sp-unit', 60), source.total, source.rate);
  return planAtTimes(parseSplitTimes(str('sp-times')), source.total, source.rate);
}

function update() {
  timesField.hidden = mode() !== 'times';
  everyField.hidden = mode() !== 'every';
  list.hidden = true;
  list.textContent = '';
  info.classList.remove('is-over');
  if (!source) {
    info.textContent = '';
    return recheckRun();
  }
  const rate = source.rate;
  const head = `${clock(source.total / rate)} long.${tooLongForPhone ? ` ${LONG_HINT_SPLITTER}` : ''}`;
  if (mode() === 'times' && !str('sp-times').trim()) {
    info.textContent = `${head} Type the times where each new part should start.`;
    return recheckRun();
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
  recheckRun();
}

async function load(file: File) {
  source?.dispose();
  source = undefined;
  tooLongForPhone = false;
  reading = true;
  update();
  try {
    // A long recording is not decoded whole: each part is decoded from the file when its turn comes. Where the browser cannot do that for the file, it is decoded whole as before.
    const seconds = await audioSeconds(file);
    let next: SplitSource | null = null;
    if (seconds > streamAboveSeconds(isPhoneBrowser())) next = await retryUnreadable(file, () => openStreamSource(file)).catch(() => null);
    if (!next) {
      tooLongForPhone = seconds >= LONG_SECONDS && isPhoneBrowser();
      const buffer = await retryUnreadable(file, () => decodeAudio(file)).catch((e) => {
        throw named('AudioDecodeError', e);
      });
      next = bufferSource(buffer);
    }
    source = next;
    $('tool').dataset.duration = String(Math.round((source.total / source.rate) * 10) / 10);
  } finally {
    reading = false;
    update();
  }
}

for (const el of document.querySelectorAll('input[name="sp-mode"], #sp-times, #sp-every, #sp-unit')) {
  el.addEventListener('input', update);
  el.addEventListener('change', update);
}

const shell = createShell({
  outputFormat: format,
  // A long job: keep the screen on while it runs (a locked phone stops the tab), and say so if the page was hidden when it failed.
  keepAwake: true,
  // Run stays off, with the reason above it, until the split points can be used. A split that cannot be made is not a run that fails.
  runBlocker() {
    if (!source) return reading ? 'Reading the sound in this file…' : '';
    try {
      plan();
      return '';
    } catch (e) {
      return e instanceof SplitError ? e.message : '';
    }
  },
  async onFilesChanged(files) {
    if (files.length === 0) {
      source?.dispose();
      source = undefined;
      return update();
    }
    loading = load(files[0]!.file).catch((e) => {
      source = undefined;
      update();
      shell.showError(e instanceof Error ? e.message : String(e));
    });
    await loading;
  },
  async process(files, progress) {
    const entry = files[0]!;
    await loading;
    if (!source) await load(entry.file);
    if (!source || !source.total) throw new NamedError('NoSoundTrack', 'No sound could be read from this file.');
    const parts = plan();
    const fmt = format();
    const outs: OutputFile[] = [];
    for (const [i, part] of parts.entries()) {
      const label = `Part ${i + 1} of ${parts.length}`;
      progress.set(label, i / parts.length);
      const length = part.to - part.from;
      // One part at a time, and one piece of it at a time: only the finished file is kept.
      const pieces = source.chunks(part);
      const blob = await (fmt === 'wav'
        ? encodeWavChunks(pieces, source.channels, source.rate, length, (f) => progress.set(label, (i + f) / parts.length))
        : encodeMp3Chunks(pieces, source.channels, source.rate, 192, length, (f) => progress.set(`${label}: encoding MP3 ${Math.round(f * 100)}%`, (i + f) / parts.length))
      ).catch((e) => {
        throw stageError('AudioSplitFailed', e, { memory: AUDIO_COPY.memorySplitter, message: AUDIO_COPY.save(fmt === 'wav' ? 'WAV' : 'MP3') });
      });
      outs.push({
        name: partName(entry.file.name, i, parts.length, fmt),
        blob,
        note: [`${clock(part.from / source.rate)} to ${clock(part.to / source.rate)}`, fmt === 'wav' ? '16-bit WAV' : '192 kbps MP3'].join(', '),
      });
    }
    return outs;
  },
});
recheckRun = () => shell.refresh();
