import { createShell, str } from '../lib/shell';
import { formatBytes, suffixName, type OutputFile } from '../lib/files';
import { retryNote } from '../lib/edit-recovery';
import { NamedError } from '../lib/input-error';
import { isPhoneBrowser, PHONE_SAFE_BYTES } from '../lib/phone-limit';
import type { SbsFit, SbsLayout, SbsLength, SbsSound } from '../lib/side-by-side-plan';

/**
 * Side by side video. Two clips, A and B, are drawn into one frame and encoded once
 * into an MP4 (see src/lib/video-side-by-side.ts); nothing leaves the tab.
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const info = $('sbs-info');

const settings = () => {
  const layout = str('sbs-layout', 'row') === 'column' ? 'column' : 'row';
  const fit = str('sbs-fit', 'contain') === 'cover' ? 'cover' : 'contain';
  const s = str('sbs-sound', 'a');
  const sound = s === 'b' || s === 'mix' || s === 'none' ? s : 'a';
  const length = str('sbs-length', 'shorter') === 'longer' ? 'longer' : 'shorter';
  return { layout, fit, sound, length } as { layout: SbsLayout; fit: SbsFit; sound: SbsSound; length: SbsLength };
};

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return m ? `${m}:${sec.toFixed(1).padStart(4, '0')}` : `${sec.toFixed(1)} s`;
};

function fillSlot(letter: 'a' | 'b', file: File | undefined) {
  $(`sbs-name-${letter}`).textContent = file ? file.name : `Drop video ${letter.toUpperCase()}`;
  $(`sbs-size-${letter}`).textContent = file ? formatBytes(file.size) : '';
}

// Which video sits in which slot. The list the shell holds has no gaps, so a lone video picked for slot B
// would read as A there; the slots keep it where it was put.
let slots: { a?: File; b?: File } = {};
const filled = () => [slots.a, slots.b].filter((f): f is File => !!f);
/** Files added some other way (the drop zone) go to A, then B, in order. */
function syncSlots() {
  const now = shell.files.map((f) => f.file);
  const mine = filled();
  if (now.length !== mine.length || now.some((f, i) => f !== mine[i])) slots = { a: now[0], b: now[1] };
}

let ticket = 0;
/** The size, length and memory estimate for the pair and the current options, shown before Run. */
async function refresh() {
  const mine = ++ticket;
  syncSlots();
  const files = filled();
  fillSlot('a', slots.a);
  fillSlot('b', slots.b);
  info.classList.remove('is-over');
  delete $('tool').dataset.refused;
  if (files.length < 2) {
    info.textContent = files.length ? `Add a second video for slot ${slots.a ? 'B' : 'A'}.` : '';
    return;
  }
  const total = files[0]!.size + files[1]!.size;
  const phone = isPhoneBrowser();
  try {
    const { sideBySideEstimate } = await import('../lib/video-side-by-side');
    const e = await sideBySideEstimate(
      files,
      { ...settings(), phone },
    );
    if (mine !== ticket) return;
    const head = `Result: ${e.width}×${e.height}, ${clock(e.seconds)} at ${e.fps} frames a second. Memory needed: about ${formatBytes(e.bytes)}.`;
    if (phone && total > PHONE_SAFE_BYTES) {
      info.textContent = `${head} The two videos are ${formatBytes(total)} together. A phone can run out of memory with more than about ${formatBytes(PHONE_SAFE_BYTES)}, so a computer, or shorter clips, is safer.`;
      info.classList.add('is-over');
    } else if (e.refusal) {
      info.textContent = `${head} ${e.refusal}`;
      info.classList.add('is-over');
      $('tool').dataset.refused = 'true';
    } else {
      info.textContent = head;
    }
  } catch (err) {
    if (mine !== ticket) return;
    info.textContent = err instanceof Error ? err.message : '';
    info.classList.add('is-over');
  }
}

const shell = createShell({
  keepAwake: true,
  remembersSize: true,
  // One picked video is not a run yet: a phone's picker hands over one file at a time.
  runBlocker: (files) => (files.length === 1 ? 'Add a second video, then press Run.' : ''),
  outputFormat: () => 'mp4',
  onFilesChanged: () => void refresh(),
  async process(files, progress) {
    if (files.length < 2) throw new NamedError('MissingSecondVideo', 'Add two videos: A and B.');
    const { sideBySide } = await import('../lib/video-side-by-side');
    const s = settings();
    progress.set('Reading the two videos…', 0.01);
    const r = await sideBySide(
      files.slice(0, 2).map((f) => f.file),
      { ...s, phone: isPhoneBrowser(), onProgress: (f) => progress.set(`Putting the videos side by side: ${Math.round(f * 100)}%`, 0.02 + f * 0.98), onNotice: (m) => progress.set(m, 0.02) },
    );
    const notes = [`${r.width}×${r.height}`, clock(r.duration), `${r.fps} fps`, r.videoCodec];
    if (r.audio) notes.push('with sound');
    else notes.push(r.audioNote || 'no sound');
    const out: OutputFile = {
      name: suffixName(files[0]!.file.name, '-side-by-side', 'mp4'),
      blob: r.blob,
      originalSize: files[0]!.file.size + files[1]!.file.size,
      note: notes.join(', ') + retryNote(r.retry, r),
    };
    return [out];
  },
  resultsTitle: () => 'Side by side video ready',
});

// Per-slot pickers: replacing one video keeps the other.
function bindSlot(letter: 'a' | 'b') {
  const slot = $(`sbs-slot-${letter}`);
  const input = $<HTMLInputElement>(`sbs-file-${letter}`);
  const set = async (file: File | undefined) => {
    if (!file) return;
    syncSlots();
    const next = { ...slots, [letter]: file };
    $<HTMLButtonElement>('clear').click();
    slots = next;
    await shell.addFiles(filled());
  };
  slot.addEventListener('click', () => input.click());
  slot.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    void set(input.files?.[0]);
    input.value = '';
  });
  slot.addEventListener('dragover', (e) => {
    e.preventDefault();
    slot.classList.add('is-over');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('is-over'));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    slot.classList.remove('is-over');
    void set(e.dataTransfer?.files[0]);
  });
}
bindSlot('a');
bindSlot('b');

$('sbs-swap').addEventListener('click', async () => {
  syncSlots();
  const next = { a: slots.b, b: slots.a };
  if (!next.a && !next.b) return;
  $<HTMLButtonElement>('clear').click();
  slots = next;
  await shell.addFiles(filled());
});
for (const id of ['sbs-layout', 'sbs-fit', 'sbs-sound', 'sbs-length']) $(id).addEventListener('change', () => void refresh());
