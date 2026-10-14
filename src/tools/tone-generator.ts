import { createShell } from '../lib/shell';
import { trackToolRun } from '../lib/analytics';
import { DEFAULT_HZ, DEFAULT_LEVEL, clampHz, formatHz, hzToSlider, levelToGain, sliderToHz, type Wave } from '../lib/tone-generator';

/**
 * Tone generator. One Web Audio oscillator through a gain node: no file, no
 * microphone, and the choices never leave the tab. The gain is ramped in and
 * out so starting and stopping never click.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const panel = $('tone-panel');
const nowText = $('tone-now');
const toggle = $<HTMLButtonElement>('tone-toggle');
const slider = $<HTMLInputElement>('tone-freq');
const sliderText = $('tone-freq-text');
const hzInput = $<HTMLInputElement>('tone-hz');
const levelInput = $<HTMLInputElement>('tone-level');
const levelText = $('tone-level-text');
const note = $('tone-note');

createShell({ process: async () => [] });

const FADE = 0.03; // seconds

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let osc: OscillatorNode | undefined;
let hz = DEFAULT_HZ;
let wave: Wave = 'sine';
let level = DEFAULT_LEVEL;
let playing = false;
let tracked = false;

const say = (text: string, warn = false) => {
  note.textContent = text;
  note.classList.toggle('is-warn', warn);
};

function paint() {
  panel.dataset.state = playing ? 'playing' : 'stopped';
  panel.dataset.hz = String(hz);
  panel.dataset.wave = wave;
  toggle.textContent = playing ? 'Stop' : 'Play';
  toggle.setAttribute('aria-pressed', String(playing));
  nowText.textContent = playing ? `${formatHz(hz)} ${wave} wave` : 'Nothing is playing.';
}

function setHz(value: number, from?: 'slider' | 'input') {
  hz = clampHz(value);
  sliderText.textContent = formatHz(hz);
  if (from !== 'slider') slider.value = String(hzToSlider(hz));
  if (from !== 'input') hzInput.value = String(hz);
  if (ctx && osc) osc.frequency.setTargetAtTime(hz, ctx.currentTime, 0.01);
  paint();
}

function setLevel(value: number) {
  level = value;
  levelText.textContent = `${value}%`;
  if (ctx && master && playing) master.gain.setTargetAtTime(levelToGain(level), ctx.currentTime, FADE / 3);
}

function stop(message = '') {
  if (ctx && master && osc) {
    const at = ctx.currentTime;
    const o = osc;
    master.gain.cancelScheduledValues(at);
    master.gain.setTargetAtTime(0, at, FADE / 3);
    try {
      o.stop(at + FADE * 2);
    } catch {
      // Already stopped.
    }
    o.onended = () => o.disconnect();
  }
  osc = undefined;
  playing = false;
  paint();
  say(message);
}

async function play() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      say('This browser cannot play sound from web pages. Recent Chrome, Edge, Firefox and Safari can.', true);
      return;
    }
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }
  try {
    await ctx.resume();
  } catch {
    // Reported below if it stays suspended.
  }
  if (!master) return;
  const at = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = wave;
  o.frequency.value = hz;
  o.connect(master);
  o.start(at);
  osc = o;
  master.gain.cancelScheduledValues(at);
  master.gain.setValueAtTime(master.gain.value, at);
  master.gain.setTargetAtTime(levelToGain(level), at, FADE / 3);
  playing = true;
  paint();
  say(ctx.state === 'running' ? '' : 'The browser is not letting this page play sound yet. Check the volume and any mute switch, then press again.', ctx.state !== 'running');
  if (!tracked) {
    tracked = true;
    // The usual single usage event: no frequency, wave or level in it.
    trackToolRun({ tool: root.dataset.slug ?? 'tone-generator', outcome: 'ok', firstOk: true, files: 0, inputBytes: 0, ms: 0 });
    root.dispatchEvent(new CustomEvent('stayput:done'));
  }
}

toggle.addEventListener('click', () => (playing ? stop() : void play()));
slider.addEventListener('input', () => setHz(sliderToHz(Number(slider.value)), 'slider'));
hzInput.addEventListener('input', () => {
  const v = Number(hzInput.value);
  if (hzInput.value !== '' && Number.isFinite(v) && v >= 1) setHz(v, 'input');
});
hzInput.addEventListener('change', () => setHz(Number(hzInput.value)));
levelInput.addEventListener('input', () => setLevel(Number(levelInput.value)));
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="tone-wave"]')) {
  r.addEventListener('change', () => {
    if (!r.checked) return;
    wave = r.value as Wave;
    if (osc) osc.type = wave;
    paint();
  });
}
for (const b of document.querySelectorAll<HTMLButtonElement>('.tone-presets [data-hz]')) {
  b.addEventListener('click', () => setHz(Number(b.dataset.hz)));
}
// A steady tone left on in a background tab is a nuisance and a hearing risk.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) stop('Stopped because the tab was hidden.');
});
window.addEventListener('pagehide', () => stop());
paint();
