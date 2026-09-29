import { bool, createShell, num } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';

/**
 * Trim video. The clip plays in the page from a blob: URL so the user can pick
 * the start and end; the cut itself is made by src/lib/video-trim.ts, loaded
 * on demand. Nothing leaves the tab.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('vg-panel');
const player = $<HTMLVideoElement>('vg-video');
const info = $('vg-info');
const startInput = $<HTMLInputElement>('vg-start');
const endInput = $<HTMLInputElement>('vg-end');
const estimate = $('vg-estimate');

let url: string | undefined;
let duration = 0;

const round1 = (s: number) => Math.round(s * 10) / 10;
const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};

function once(event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(timer);
      player.removeEventListener(event, ok);
      player.removeEventListener('error', bad);
      fn();
    };
    const ok = () => done(resolve);
    const bad = () => done(() => reject(new Error('This browser cannot play this video. iPhone videos are often HEVC (H.265), which Chrome and Firefox on Windows or Linux cannot decode: try Safari.')));
    const timer = setTimeout(() => done(() => reject(new Error(`Timed out waiting for the video (${event}).`))), timeoutMs);
    player.addEventListener(event, ok);
    player.addEventListener('error', bad);
  });
}

function unload() {
  player.pause();
  player.removeAttribute('src');
  player.load();
  if (url) URL.revokeObjectURL(url);
  url = undefined;
  duration = 0;
  panel.hidden = true;
  estimate.textContent = '';
}

async function load(file: File) {
  unload();
  url = URL.createObjectURL(file);
  const loaded = once('loadeddata', 20_000);
  player.src = url;
  await loaded;
  duration = player.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    // Browser recordings often leave the length out; seeking far past the end makes the player find it.
    const seeked = once('seeked', 10_000);
    player.currentTime = 1e7;
    await seeked.catch(() => undefined);
    duration = Number.isFinite(player.duration) ? player.duration : 0;
    player.currentTime = 0;
  }
  panel.hidden = false;
  for (const el of [startInput, endInput]) el.max = String(round1(duration));
  startInput.value = '0';
  endInput.value = String(round1(duration));
  info.textContent = `${player.videoWidth} × ${player.videoHeight} px, ${clock(duration)} long. Play or scrub to a moment, then use "Set start" and "Set end".`;
  panel.dataset.duration = String(round1(duration));
  update();
}

function range(): { start: number; end: number } {
  const start = Math.min(duration, Math.max(0, num('vg-start', 0)));
  const end = Math.min(duration, Math.max(0, num('vg-end', duration)));
  return { start, end };
}

function update() {
  if (!duration) return;
  const { start, end } = range();
  const bad = end <= start;
  estimate.classList.toggle('is-over', bad);
  estimate.textContent = bad ? 'The end must come after the start.' : `Keeps ${clock(end - start)}, from ${clock(start)} to ${clock(end)}.`;
}

$('vg-set-start').addEventListener('click', () => {
  startInput.value = String(round1(player.currentTime));
  update();
});
$('vg-set-end').addEventListener('click', () => {
  endInput.value = String(round1(player.currentTime));
  update();
});
for (const el of [startInput, endInput]) {
  el.addEventListener('input', update);
  el.addEventListener('change', update);
}
startInput.addEventListener('change', () => {
  if (duration) player.currentTime = range().start;
});
endInput.addEventListener('change', () => {
  if (duration) player.currentTime = range().end;
});

const shell = createShell({
  async onFilesChanged(files) {
    if (files.length === 0) return unload();
    try {
      await load(files[0]!.file);
    } catch (e) {
      unload();
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (!url || !duration) await load(entry.file);
    if (!duration) throw new Error('Could not tell how long this video is.');
    const { start, end } = range();
    if (end <= start) throw new Error('The end time must come after the start time.');
    player.pause();
    progress.set('Opening the video…', 0);
    const { trimVideo } = await import('../lib/video-trim');
    const exact = bool('exact');
    const r = await trimVideo(entry.file, {
      start,
      end,
      exact,
      mute: bool('mute'),
      onProgress: (f) => progress.set(`Cutting ${entry.file.name}: ${Math.round(f * 100)}%`, f),
    });
    const out: OutputFile = {
      name: suffixName(entry.file.name, '-trimmed', r.ext),
      blob: r.blob,
      originalSize: entry.file.size,
      note: `${clock(start)} to ${clock(end)}, ${exact ? 'cut exactly' : 'fast cut'}`,
    };
    return [out];
  },
});
