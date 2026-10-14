import { createShell } from '../lib/shell';
import { trackToolRun } from '../lib/analytics';

/**
 * Dead pixel test. A full-window layer is filled with one solid colour at a
 * time. It asks the browser for real full screen; where that is missing (iPhone
 * Safari) it fills the browser window instead and says so. No file, no
 * permission, and nothing leaves the tab.
 */

const COLOURS = ['black', 'white', 'red', 'green', 'blue'] as const;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const screenEl = $('dpx-screen');
const hint = $('dpx-hint');
const modeText = $('dpx-mode');
const cycleBox = $<HTMLInputElement>('dpx-cycle');
const secondsSel = $<HTMLSelectElement>('dpx-seconds');

// The shell supplies the privacy panel and next steps; files are never added here.
createShell({ process: async () => [] });

let index = 0;
let open = false;
let timer = 0;
let quietTimer = 0;
let tracked = false;

function show() {
  screenEl.dataset.colour = COLOURS[index];
}

function wake() {
  screenEl.classList.remove('dpx-quiet');
  clearTimeout(quietTimer);
  quietTimer = window.setTimeout(() => screenEl.classList.add('dpx-quiet'), 3000);
}

function restartCycle() {
  clearInterval(timer);
  if (open && cycleBox.checked) {
    timer = window.setInterval(() => step(1), Number(secondsSel.value) * 1000);
  }
}

function step(by: number) {
  index = (index + by + COLOURS.length) % COLOURS.length;
  show();
}

function manualStep(by: number) {
  step(by);
  restartCycle();
}

async function start(colour = 'black') {
  index = Math.max(0, COLOURS.indexOf(colour as (typeof COLOURS)[number]));
  show();
  let mode = 'window';
  screenEl.hidden = false;
  open = true;
  const el = screenEl as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (document.fullscreenEnabled && el.requestFullscreen) {
      await el.requestFullscreen();
      mode = 'fullscreen';
    } else if (el.webkitRequestFullscreen && (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled) {
      await el.webkitRequestFullscreen();
      mode = 'fullscreen';
    }
  } catch {
    mode = 'window';
  }
  if (!open) return; // left again while the browser was deciding
  screenEl.dataset.mode = mode;
  hint.textContent =
    mode === 'fullscreen'
      ? 'Click or arrow keys: next colour. Esc: exit.'
      : 'This browser cannot go full screen, so the test fills the window. Tap for the next colour; use × to exit.';
  modeText.textContent =
    mode === 'fullscreen'
      ? 'Test running in full screen.'
      : 'This browser does not support full screen, so the test filled the browser window instead. Some of the screen at the edges may still show browser controls.';
  wake();
  restartCycle();
  if (!tracked) {
    tracked = true;
    // The usual single usage event: no colour or setting in it.
    trackToolRun({ tool: root.dataset.slug ?? 'dead-pixel-test', outcome: 'ok', firstOk: true, files: 0, inputBytes: 0, ms: 0 });
    root.dispatchEvent(new CustomEvent('stayput:done'));
  }
}

function stop() {
  if (!open) return;
  open = false;
  clearInterval(timer);
  clearTimeout(quietTimer);
  screenEl.hidden = true;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}

$('dpx-start').addEventListener('click', () => void start('black'));
document.querySelectorAll<HTMLElement>('.dpx-swatch').forEach((b) => b.addEventListener('click', () => void start(b.dataset.colour)));
screenEl.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).id === 'dpx-exit') return;
  wake();
  manualStep(1);
});
$('dpx-exit').addEventListener('click', stop);
screenEl.addEventListener('pointermove', wake);
cycleBox.addEventListener('change', restartCycle);
secondsSel.addEventListener('change', restartCycle);
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) stop();
});
document.addEventListener(
  'keydown',
  (e) => {
    if (!open) return;
    const k = e.key;
    if (k === 'Escape') stop();
    else if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown') manualStep(1);
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') manualStep(-1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);
