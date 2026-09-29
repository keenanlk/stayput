import { createShell } from '../lib/shell';
import { trackToolRun } from '../lib/analytics';
import { bpmFromTaps, clampBpm, clicksBetween, subdivisions, tempoName, type Click } from '../lib/metronome';

/**
 * Metronome. A timer wakes every 25 ms and schedules the clicks due in the
 * next 120 ms on the Web Audio clock, so a busy page never makes a click late;
 * the beat lights follow the same clock. Nothing leaves the page.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const panel = $('metro-panel');
const bpmOut = $<HTMLOutputElement>('metro-bpm');
const nameEl = $('metro-name');
const slider = $<HTMLInputElement>('bpm');
const lights = $('metro-lights');
const tapNote = $('metro-tap-note');
const startBtn = $<HTMLButtonElement>('metro-start');
const tapBtn = $<HTMLButtonElement>('metro-tap');
const beatsSel = $<HTMLSelectElement>('beats');
const subSel = $<HTMLSelectElement>('subdivision');
const soundSel = $<HTMLSelectElement>('sound');
const accentBox = $<HTMLInputElement>('accent');

// The shell supplies the privacy panel and next steps; files are never added here.
createShell({ process: async () => [] });

const LOOKAHEAD = 0.12; // seconds of clicks scheduled ahead
const WAKE_MS = 25;

let ctx: AudioContext | undefined;
let bpm = clampBpm(Number(slider.value) || 100);
let running = false;
let timer = 0;
let frame = 0;
// The current stretch of the schedule: click `index` falls at origin + index × one click at segBpm, segPer.
let origin = 0;
let index = 0;
let segBpm = bpm;
let segPer = 1;
let queue: Click[] = [];
let taps: number[] = [];
let tracked = false;

const beats = () => Number(beatsSel.value) || 4;
const perBeat = () => subdivisions[subSel.value] ?? 1;

function drawLights() {
  lights.replaceChildren(
    ...Array.from({ length: beats() }, (_, i) => {
      const d = document.createElement('span');
      d.className = `metro-light${i === 0 && beats() > 1 && accentBox.checked ? ' is-first' : ''}`;
      return d;
    }),
  );
}

function setBpm(value: number) {
  bpm = clampBpm(value);
  slider.value = String(bpm);
  bpmOut.textContent = String(bpm);
  nameEl.textContent = tempoName(bpm);
  if (running) restartFromNextClick();
}

/**
 * Keep the beat going after a change: the next beat still falls where the old
 * settings put it, and counts on in the bar; the beats after it use the new
 * settings.
 */
function restartFromNextClick() {
  if (!ctx) return;
  const nextBeat = index ? Math.floor((index - 1) / segPer) + 1 : 0;
  const at = Math.max(origin + (nextBeat * 60) / segBpm, ctx.currentTime + 0.02);
  segBpm = bpm;
  segPer = perBeat();
  origin = at - (nextBeat * 60) / segBpm;
  index = nextBeat * segPer;
}

function playClick(c: Click) {
  if (!ctx) return;
  const first = c.sub === 0 && c.beat === 0 && beats() > 1 && accentBox.checked;
  const onBeat = c.sub === 0;
  const kind = soundSel.value;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const base = kind === 'wood' ? 800 : kind === 'beep' ? 880 : 1000;
  osc.type = kind === 'beep' ? 'sine' : kind === 'wood' ? 'triangle' : 'square';
  osc.frequency.value = first ? base * 1.5 : onBeat ? base : base * 0.8;
  const peak = first ? 0.5 : onBeat ? 0.35 : 0.15;
  const length = kind === 'beep' ? 0.08 : 0.03;
  gain.gain.setValueAtTime(0, c.time);
  gain.gain.linearRampToValueAtTime(peak, c.time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.time + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(c.time);
  osc.stop(c.time + length + 0.01);
}

function schedule() {
  if (!ctx) return;
  const { clicks, next } = clicksBetween(origin, index, ctx.currentTime + LOOKAHEAD, segBpm, beats(), segPer);
  index = next;
  for (const c of clicks) {
    playClick(c);
    if (c.sub === 0) queue.push(c);
  }
}

function paint() {
  frame = requestAnimationFrame(paint);
  if (!ctx) return;
  let shown: Click | undefined;
  while (queue.length && queue[0]!.time <= ctx.currentTime) shown = queue.shift();
  if (!shown) return;
  lights.querySelectorAll('.metro-light').forEach((l, i) => l.classList.toggle('is-on', i === shown!.beat));
  panel.dataset.beat = String(shown.beat + 1);
}

async function start() {
  ctx ??= new AudioContext();
  await ctx.resume();
  running = true;
  queue = [];
  origin = ctx.currentTime + 0.06;
  index = 0;
  segBpm = bpm;
  segPer = perBeat();
  panel.dataset.state = 'running';
  startBtn.textContent = 'Stop';
  schedule();
  timer = window.setInterval(schedule, WAKE_MS);
  paint();
  if (!tracked) {
    tracked = true;
    trackToolRun({ tool: root.dataset.slug ?? 'metronome', outcome: 'ok', firstOk: true, files: 0, inputBytes: 0, ms: 0, format: subSel.value });
    root.dispatchEvent(new CustomEvent('stayput:done'));
  }
}

function stop() {
  running = false;
  clearInterval(timer);
  cancelAnimationFrame(frame);
  queue = [];
  panel.dataset.state = 'stopped';
  delete panel.dataset.beat;
  startBtn.textContent = 'Start';
  lights.querySelectorAll('.metro-light').forEach((l) => l.classList.remove('is-on'));
}

function toggle() {
  if (running) stop();
  else void start();
}

function tap() {
  const now = performance.now();
  taps.push(now);
  taps = taps.slice(-16);
  const found = bpmFromTaps(taps);
  let runStart = 0;
  for (let i = taps.length - 1; i > 0; i--) {
    if (taps[i]! - taps[i - 1]! > 2000) {
      runStart = i;
      break;
    }
  }
  const count = taps.length - runStart;
  if (found) {
    setBpm(found);
    tapNote.textContent = `${found} BPM from ${Math.min(count, 8)} taps. Keep tapping to refine it.`;
  } else {
    tapNote.textContent = 'Keep tapping along to the beat.';
  }
  panel.dataset.tapped = String(taps.length);
}

startBtn.addEventListener('click', toggle);
tapBtn.addEventListener('click', tap);
$('metro-down').addEventListener('click', () => setBpm(bpm - 1));
$('metro-up').addEventListener('click', () => setBpm(bpm + 1));
slider.addEventListener('input', () => setBpm(Number(slider.value)));
for (const el of [beatsSel, subSel, accentBox]) {
  el.addEventListener('change', () => {
    drawLights();
    if (running) restartFromNextClick();
  });
}
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.code !== 'Space' || e.repeat || t.closest('input, select, textarea, button, a, [contenteditable]')) return;
  e.preventDefault();
  toggle();
});
drawLights();
setBpm(bpm);
