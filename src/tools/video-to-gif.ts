import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { createShell, num, str, radio } from '../lib/shell';
import { thumbnail } from '../lib/image';
import { suffixName, type OutputFile } from '../lib/files';

/**
 * Video to GIF. The browser's own decoder plays the file from a blob: URL;
 * frames are taken by seeking a second, hidden video element to each moment,
 * drawn onto a canvas at the chosen width, reduced to 256 colours and written
 * with gifenc. Nothing leaves the tab.
 */

/** GIFs past this many frames run to tens of megabytes; ask for a shorter clip instead. */
const MAX_FRAMES = 600;
/** How much of a long video the trim starts with. */
const DEFAULT_CLIP = 10;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const panel = $('vg-panel');
const player = $<HTMLVideoElement>('vg-video');
const info = $('vg-info');
const startInput = $<HTMLInputElement>('vg-start');
const endInput = $<HTMLInputElement>('vg-end');
const estimate = $('vg-estimate');

let url: string | undefined;
let duration = 0;
let videoW = 0;
let videoH = 0;

const round1 = (s: number) => Math.round(s * 10) / 10;
const fmt = (s: number) => `${round1(s).toFixed(1)} s`;

/** Wait for `event` on a media element; an `error` event or the timeout rejects. */
function once(el: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(timer);
      el.removeEventListener(event, ok);
      el.removeEventListener('error', bad);
      fn();
    };
    const ok = () => done(resolve);
    const bad = () => done(() => reject(new Error(unplayable())));
    const timer = setTimeout(() => done(() => reject(new Error(`Timed out waiting for the video (${event}).`))), timeoutMs);
    el.addEventListener(event, ok);
    el.addEventListener('error', bad);
  });
}

function unplayable(): string {
  return 'This browser cannot play this video, so it cannot turn it into a GIF. iPhone videos are often HEVC (H.265), which Chrome and Firefox on Windows or Linux cannot decode: try Safari, or save the video as H.264 ("Most Compatible").';
}

/** Seek and wait until the frame at `t` is ready to draw. */
async function seek(v: HTMLVideoElement, t: number): Promise<void> {
  const wait = once(v, 'seeked', 10_000);
  v.currentTime = t;
  await wait;
}

async function loadInto(v: HTMLVideoElement, src: string): Promise<void> {
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  const wait = once(v, 'loadeddata', 20_000);
  v.src = src;
  await wait;
  if (!v.videoWidth || !v.videoHeight) throw new Error('This file has no picture this browser can show.');
}

/**
 * Some files (recordings saved by browsers, some screen recorders) do not
 * store their length, so `duration` is Infinity until the player has seen the
 * end. Seeking far past the end makes the browser find it.
 */
async function realDuration(v: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(v.duration) && v.duration > 0) return v.duration;
  try {
    await seek(v, 1e7);
  } catch {
    // Fall through with whatever the browser learned.
  }
  const d = v.duration;
  await seek(v, 0).catch(() => undefined);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

function unload() {
  player.pause();
  player.removeAttribute('src');
  player.load();
  if (url) URL.revokeObjectURL(url);
  url = undefined;
  duration = videoW = videoH = 0;
  panel.hidden = true;
  estimate.textContent = '';
}

async function load(file: File) {
  unload();
  url = URL.createObjectURL(file);
  try {
    await loadInto(player, url);
  } catch (e) {
    unload();
    throw e;
  }
  videoW = player.videoWidth;
  videoH = player.videoHeight;
  duration = await realDuration(player);
  panel.hidden = false;
  for (const el of [startInput, endInput]) el.max = String(round1(duration));
  startInput.value = '0';
  endInput.value = String(round1(Math.min(duration, DEFAULT_CLIP)));
  info.textContent = `${videoW} × ${videoH} px, ${fmt(duration)} long. Play or scrub to a moment, then use "Set start" and "Set end".`;
  panel.dataset.duration = String(round1(duration));
  update();
}

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */
interface Plan {
  start: number;
  end: number;
  fps: number;
  width: number;
  height: number;
  frames: number;
}

function plan(): Plan {
  let start = Math.max(0, num('vg-start', 0));
  let end = num('vg-end', duration);
  if (duration) {
    start = Math.min(start, duration);
    end = Math.min(end, duration);
  }
  const fps = Math.min(30, Math.max(1, num('fps', 10)));
  const choice = str('width', '480');
  const width = Math.max(2, Math.min(videoW || 1, choice === 'original' ? videoW : Number(choice) || 480));
  const height = Math.max(2, Math.round((videoH * width) / (videoW || 1)));
  const frames = Math.max(1, Math.round((end - start) * fps));
  return { start, end, fps, width, height, frames };
}

function update() {
  if (!duration) return;
  const p = plan();
  const over = p.frames > MAX_FRAMES;
  estimate.classList.toggle('is-over', over || p.end <= p.start);
  if (p.end <= p.start) estimate.textContent = 'The end must come after the start.';
  else if (over) estimate.textContent = `${p.frames} frames is more than the ${MAX_FRAMES}-frame limit. Shorten the clip or lower the frame rate.`;
  else estimate.textContent = `${fmt(p.end - p.start)} clip → ${p.width} × ${p.height} GIF, ${p.frames} frames.`;
}

$('vg-set-start').addEventListener('click', () => {
  startInput.value = String(round1(player.currentTime));
  if (Number(endInput.value) <= Number(startInput.value)) endInput.value = String(round1(Math.min(duration, player.currentTime + DEFAULT_CLIP)));
  update();
});
$('vg-set-end').addEventListener('click', () => {
  endInput.value = String(round1(player.currentTime));
  update();
});
for (const id of ['vg-start', 'vg-end', 'width', 'fps']) {
  $(id).addEventListener('input', update);
  $(id).addEventListener('change', update);
}
// Typing a start time shows that frame in the player.
startInput.addEventListener('change', () => {
  if (duration) player.currentTime = Math.min(duration, Math.max(0, Number(startInput.value) || 0));
});

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
const shell = createShell({
  async onFilesChanged(files) {
    if (files.length === 0) return unload();
    try {
      await load(files[0]!.file);
    } catch (e) {
      shell.showError(e instanceof Error ? e.message : String(e));
    }
  },
  outputFormat: () => 'gif',
  async process(files, progress) {
    const entry = files[0]!;
    if (!url || !duration) await load(entry.file);
    if (!duration) throw new Error('Could not tell how long this video is.');
    const p = plan();
    if (p.end <= p.start) throw new Error('The end time must come after the start time.');
    if (p.frames > MAX_FRAMES) throw new Error(`That clip needs ${p.frames} frames; the limit is ${MAX_FRAMES}. Shorten the clip or lower the frame rate.`);
    player.pause();

    progress.set('Opening the video…', 0);
    const source = document.createElement('video');
    try {
      await loadInto(source, url!);
      const canvas = document.createElement('canvas');
      canvas.width = p.width;
      canvas.height = p.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingQuality = 'high';
      const gif = GIFEncoder();
      const delay = Math.round(1000 / p.fps);
      const repeat = radio('loop', 'forever') === 'forever' ? 0 : -1;
      // The last moment a frame can be read from; seeking to the very end can show nothing.
      const last = Math.max(0, duration - 0.02);
      let preview: string | undefined;
      for (let i = 0; i < p.frames; i++) {
        await seek(source, Math.min(last, p.start + i / p.fps));
        ctx.drawImage(source, 0, 0, p.width, p.height);
        const { data } = ctx.getImageData(0, 0, p.width, p.height);
        const palette = quantize(data, 256, { format: 'rgb565' });
        gif.writeFrame(applyPalette(data, palette, 'rgb565'), p.width, p.height, { palette, delay, repeat });
        if (i === 0) {
          const bitmap = await createImageBitmap(canvas);
          preview = await thumbnail(bitmap);
          bitmap.close();
        }
        progress.set(`Frame ${i + 1} of ${p.frames}`, (i + 1) / p.frames);
      }
      gif.finish();
      const out: OutputFile = {
        name: suffixName(entry.file.name, '', 'gif'),
        blob: new Blob([gif.bytes() as BlobPart], { type: 'image/gif' }),
        originalSize: entry.file.size,
        previewUrl: preview,
        note: `${p.width}×${p.height}, ${p.frames} frames at ${p.fps} fps`,
      };
      progress.set('Done', 1);
      return [out];
    } finally {
      source.removeAttribute('src');
      source.load();
    }
  },
});
