import { bool, createShell, num, str } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { channelsOf, decodeAudio, encodeMp3, encodeWav, SAMPLE_RATE } from '../lib/audio';
import { cutChannels, peaks } from '../lib/audio-trim';

/**
 * Trim audio. The file is decoded in the page to draw its waveform and play
 * it from a blob: URL; the chosen part is cut, faded and written as MP3 or
 * WAV. Nothing leaves the tab.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('au-panel');
const wave = $<HTMLCanvasElement>('au-wave');
const player = $<HTMLAudioElement>('au-audio');
const info = $('au-info');
const startInput = $<HTMLInputElement>('au-start');
const endInput = $<HTMLInputElement>('au-end');
const estimate = $('au-estimate');

const FADE = 1.5;
let url: string | undefined;
let buffer: AudioBuffer | undefined;
let bars: Float32Array | undefined;
let duration = 0;
let loading: Promise<void> | undefined;

const round1 = (s: number) => Math.round(s * 10) / 10;
const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};

function range(): { start: number; end: number } {
  const start = Math.min(duration, Math.max(0, num('au-start', 0)));
  const end = Math.min(duration, Math.max(0, num('au-end', duration)));
  return { start, end };
}

function draw() {
  if (!bars || !duration) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(wave.clientWidth * dpr));
  const h = Math.round(120 * dpr);
  if (wave.width !== w || wave.height !== h) {
    wave.width = w;
    wave.height = h;
    bars = buffer ? peaks(channelsOf(buffer, false), Math.max(1, Math.floor(w / (3 * dpr)))) : bars;
  }
  const css = getComputedStyle(document.documentElement);
  const colour = (name: string) => css.getPropertyValue(name).trim();
  const ctx = wave.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const { start, end } = range();
  const barW = w / bars.length;
  for (let i = 0; i < bars.length; i++) {
    const t = ((i + 0.5) / bars.length) * duration;
    ctx.fillStyle = t >= start && t <= end ? colour('--accent') : colour('--line-strong');
    const bh = Math.max(2 * dpr, bars[i]! * (h - 8 * dpr));
    ctx.fillRect(i * barW + barW * 0.15, (h - bh) / 2, Math.max(1, barW * 0.7), bh);
  }
  ctx.fillStyle = colour('--ink');
  const x = (player.currentTime / duration) * w;
  ctx.fillRect(Math.min(w - 2 * dpr, x), 0, 2 * dpr, h);
}

function unload() {
  player.pause();
  player.removeAttribute('src');
  player.load();
  if (url) URL.revokeObjectURL(url);
  url = undefined;
  buffer = undefined;
  bars = undefined;
  duration = 0;
  panel.hidden = true;
  estimate.textContent = '';
}

async function load(file: File) {
  unload();
  buffer = await decodeAudio(file);
  duration = buffer.duration;
  url = URL.createObjectURL(file);
  player.src = url;
  panel.hidden = false;
  bars = peaks(channelsOf(buffer, false), 200);
  wave.width = 0;
  for (const el of [startInput, endInput]) el.max = String(round1(duration));
  startInput.value = '0';
  endInput.value = String(round1(duration));
  info.textContent = `${clock(duration)} long. Play or click the waveform to find a moment, then use "Set start" and "Set end".`;
  panel.dataset.duration = String(round1(duration));
  update();
}

function update() {
  if (!duration) return;
  const { start, end } = range();
  const bad = end <= start;
  estimate.classList.toggle('is-over', bad);
  estimate.textContent = bad ? 'The end must come after the start.' : `Keeps ${clock(end - start)}, from ${clock(start)} to ${clock(end)}.`;
  draw();
}

wave.addEventListener('pointerdown', (e) => {
  if (!duration) return;
  const r = wave.getBoundingClientRect();
  player.currentTime = Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration));
  draw();
});
player.addEventListener('timeupdate', draw);
player.addEventListener('seeked', draw);
window.addEventListener('resize', draw);
$('au-set-start').addEventListener('click', () => {
  startInput.value = String(round1(player.currentTime));
  update();
});
$('au-set-end').addEventListener('click', () => {
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

const format = () => (str('format', 'mp3') === 'wav' ? 'wav' : 'mp3');

const shell = createShell({
  outputFormat: format,
  async onFilesChanged(files) {
    if (files.length === 0) return unload();
    loading = load(files[0]!.file).catch((e) => {
      unload();
      shell.showError(e instanceof Error ? e.message : String(e));
    });
    await loading;
  },
  async process(files, progress) {
    const entry = files[0]!;
    await loading;
    if (!buffer) await load(entry.file);
    if (!buffer || !duration) throw new Error('No sound could be read from this file.');
    const { start, end } = range();
    if (end <= start) throw new Error('The end time must come after the start time.');
    player.pause();
    const chans = cutChannels(channelsOf(buffer, false), SAMPLE_RATE, {
      start,
      end,
      fadeIn: bool('fade-in') ? FADE : 0,
      fadeOut: bool('fade-out') ? FADE : 0,
    });
    const fmt = format();
    const blob =
      fmt === 'wav' ? encodeWav(chans) : await encodeMp3(chans, 192, (f) => progress.set(`Encoding MP3: ${Math.round(f * 100)}%`, f));
    const fades = [bool('fade-in') && 'fade in', bool('fade-out') && 'fade out'].filter(Boolean);
    const out: OutputFile = {
      name: suffixName(entry.file.name, '-trimmed', fmt),
      blob,
      originalSize: entry.file.size,
      note: [`${clock(start)} to ${clock(end)}`, fmt === 'wav' ? '16-bit WAV' : '192 kbps MP3', ...fades].join(', '),
    };
    return [out];
  },
});
