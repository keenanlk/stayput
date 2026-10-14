import { createShell, str, type ShellFile } from '../lib/shell';
import { formatBytes, suffixName, type OutputFile } from '../lib/files';
import { InputError } from '../lib/input-error';
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

function fillSlot(letter: 'a' | 'b', entry: ShellFile | undefined) {
  $(`sbs-name-${letter}`).textContent = entry ? entry.file.name : `Drop video ${letter.toUpperCase()}`;
  $(`sbs-size-${letter}`).textContent = entry ? formatBytes(entry.file.size) : '';
}

let ticket = 0;
/** The size, length and memory estimate for the pair and the current options, shown before Run. */
async function refresh() {
  const mine = ++ticket;
  const files = shell.files.slice(0, 2);
  fillSlot('a', files[0]);
  fillSlot('b', files[1]);
  info.classList.remove('is-over');
  delete $('tool').dataset.refused;
  if (files.length < 2) {
    info.textContent = files.length ? 'Add a second video for slot B.' : '';
    return;
  }
  const total = files[0]!.file.size + files[1]!.file.size;
  const phone = isPhoneBrowser();
  try {
    const { sideBySideEstimate } = await import('../lib/video-side-by-side');
    const e = await sideBySideEstimate(
      files.map((f) => f.file),
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
  outputFormat: () => 'mp4',
  onFilesChanged: () => void refresh(),
  async process(files, progress) {
    if (files.length < 2) throw new InputError('Add two videos: A and B.');
    const { sideBySide } = await import('../lib/video-side-by-side');
    const s = settings();
    progress.set('Reading the two videos…', 0.01);
    const r = await sideBySide(
      files.slice(0, 2).map((f) => f.file),
      { ...s, phone: isPhoneBrowser(), onProgress: (f) => progress.set(`Putting the videos side by side: ${Math.round(f * 100)}%`, 0.02 + f * 0.98) },
    );
    const notes = [`${r.width}×${r.height}`, clock(r.duration), `${r.fps} fps`, r.videoCodec];
    if (r.audio) notes.push('with sound');
    else notes.push(r.audioNote || 'no sound');
    const out: OutputFile = {
      name: suffixName(files[0]!.file.name, '-side-by-side', 'mp4'),
      blob: r.blob,
      originalSize: files[0]!.file.size + files[1]!.file.size,
      note: notes.join(', '),
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
    const files = shell.files.map((f) => f.file);
    if (letter === 'a') files[0] = file;
    else if (files.length === 0) files.push(file);
    else files[1] = file;
    $<HTMLButtonElement>('clear').click();
    await shell.addFiles(files.slice(0, 2));
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
  const files = shell.files.map((f) => f.file);
  if (files.length < 2) return;
  $<HTMLButtonElement>('clear').click();
  await shell.addFiles([files[1]!, files[0]!]);
});
for (const id of ['sbs-layout', 'sbs-fit', 'sbs-sound', 'sbs-length']) $(id).addEventListener('change', () => void refresh());
