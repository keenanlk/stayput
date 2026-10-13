import { createShell } from '../lib/shell';
import { trackToolRun } from '../lib/analytics';
import {
  AUTO_STOP_SECONDS, CONFIRM_ABOVE, DEFAULT_LEVEL, SWEEP_FROM, SWEEP_SECONDS, SWEEP_TO,
  channelGains, formatHz, levelToGain, pinkNoise, sweepFrequency, type Channel,
} from '../lib/speaker-test';

/**
 * Speaker test. Every sound is made in the page with Web Audio: an oscillator
 * or a loop of pink noise goes through one gain per side into a two-channel
 * merger, so a side that is not chosen gets exact silence. No file, no
 * microphone, and the choices never leave the tab.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const panel = $('spk-panel');
const nowText = $('spk-now');
const toneBtn = $<HTMLButtonElement>('spk-tone');
const sweepBtn = $<HTMLButtonElement>('spk-sweep');
const noiseBtn = $<HTMLButtonElement>('spk-noise');
const stopBtn = $<HTMLButtonElement>('spk-stop');
const freqSel = $<HTMLSelectElement>('spk-freq');
const levelInput = $<HTMLInputElement>('spk-level');
const levelText = $('spk-level-text');
const confirmBox = $('spk-confirm');
const note = $('spk-note');

// The shell supplies the privacy panel and next steps; files are never added here.
createShell({ process: async () => [] });

type Sound = 'tone' | 'sweep' | 'noise';

const FADE = 0.03; // seconds, so starting and stopping never click

let ctx: AudioContext | undefined;
let left: GainNode | undefined;
let right: GainNode | undefined;
let master: GainNode | undefined;
let noiseBuffer: AudioBuffer | undefined;
let source: OscillatorNode | AudioBufferSourceNode | undefined;
let sound: Sound | undefined;
let sweepStart = 0;
let frame = 0;
let autoStop = 0;
let level = DEFAULT_LEVEL;
let pending: number | undefined; // a level above the confirm line, waiting for a press
let allowed = false;
let tracked = false;

function say(text: string, warn = false) {
  note.textContent = text;
  note.classList.toggle('is-warn', warn);
}

const channel = (): Channel => (document.querySelector<HTMLInputElement>('input[name="spk-channel"]:checked')?.value as Channel | undefined) ?? 'both';
const channelName = (c: Channel) => ({ left: 'left channel', right: 'right channel', both: 'both channels' })[c];

function applyChannel(at: number) {
  if (!left || !right) return;
  const g = channelGains(channel());
  left.gain.cancelScheduledValues(at);
  right.gain.cancelScheduledValues(at);
  left.gain.setTargetAtTime(g.left, at, FADE / 3);
  right.gain.setTargetAtTime(g.right, at, FADE / 3);
}

function applyLevel() {
  if (!ctx || !master) return;
  const at = ctx.currentTime;
  master.gain.cancelScheduledValues(at);
  master.gain.setTargetAtTime(sound ? levelToGain(level) : 0, at, FADE / 3);
}

function describe(): string {
  const c = channelName(channel());
  if (sound === 'tone') return `${formatHz(Number(freqSel.value))} tone, ${c}`;
  if (sound === 'noise') return `Pink noise, ${c}`;
  if (sound === 'sweep') {
    const t = ctx ? ctx.currentTime - sweepStart : 0;
    return `Sweep ${formatHz(sweepFrequency(t))}, ${c}`;
  }
  return 'Nothing is playing.';
}

function paint() {
  if (!sound) return;
  nowText.textContent = describe();
  if (sound === 'sweep' && ctx && ctx.currentTime - sweepStart >= SWEEP_SECONDS + 0.2) {
    stop('The sweep is over.');
    return;
  }
  frame = requestAnimationFrame(paint);
}

function setPlaying(playing: boolean) {
  panel.dataset.state = playing ? 'playing' : 'stopped';
  panel.dataset.sound = sound ?? '';
  stopBtn.disabled = !playing;
  toneBtn.textContent = playing && sound === 'tone' ? 'Playing tone' : 'Play tone';
  sweepBtn.textContent = playing && sound === 'sweep' ? 'Sweeping' : 'Sweep';
  noiseBtn.textContent = playing && sound === 'noise' ? 'Playing noise' : 'Pink noise';
  for (const [b, s] of [[toneBtn, 'tone'], [sweepBtn, 'sweep'], [noiseBtn, 'noise']] as const) b.setAttribute('aria-pressed', String(playing && sound === s));
}

function endSource(fadeAt: number) {
  const s = source;
  source = undefined;
  if (!s) return;
  try {
    s.stop(fadeAt + FADE);
  } catch {
    // Already stopped.
  }
  s.onended = () => s.disconnect();
}

function stop(message = '') {
  cancelAnimationFrame(frame);
  clearTimeout(autoStop);
  if (ctx && master && source) {
    const at = ctx.currentTime;
    master.gain.cancelScheduledValues(at);
    master.gain.setTargetAtTime(0, at, FADE / 3);
    endSource(at);
  }
  sound = undefined;
  nowText.textContent = 'Nothing is playing.';
  setPlaying(false);
  say(message);
}

function ensureGraph(): boolean {
  if (ctx) return true;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    say('This browser cannot play sound from web pages. Recent Chrome, Edge, Firefox and Safari can.', true);
    return false;
  }
  ctx = new Ctor();
  const merger = ctx.createChannelMerger(2);
  left = ctx.createGain();
  right = ctx.createGain();
  master = ctx.createGain();
  master.gain.value = 0;
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  merger.connect(master).connect(ctx.destination);
  return true;
}

async function play(next: Sound) {
  if (!ensureGraph() || !ctx || !master || !left || !right) return;
  try {
    await ctx.resume();
  } catch {
    // Reported below if it stays suspended.
  }
  const at = ctx.currentTime;
  endSource(at);
  const gains = channelGains(channel());
  left.gain.cancelScheduledValues(at);
  right.gain.cancelScheduledValues(at);
  left.gain.setValueAtTime(gains.left, at);
  right.gain.setValueAtTime(gains.right, at);
  let s: OscillatorNode | AudioBufferSourceNode;
  if (next === 'noise') {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      noiseBuffer.getChannelData(0).set(pinkNoise(noiseBuffer.length));
    }
    const b = ctx.createBufferSource();
    b.buffer = noiseBuffer;
    b.loop = true;
    s = b;
  } else {
    const o = ctx.createOscillator();
    o.type = 'sine';
    if (next === 'sweep') {
      o.frequency.setValueAtTime(SWEEP_FROM, at);
      o.frequency.exponentialRampToValueAtTime(SWEEP_TO, at + SWEEP_SECONDS);
    } else {
      o.frequency.value = Number(freqSel.value);
    }
    s = o;
  }
  s.connect(left);
  s.connect(right);
  s.start(at);
  source = s;
  sound = next;
  sweepStart = at;
  master.gain.cancelScheduledValues(at);
  master.gain.setValueAtTime(master.gain.value, at);
  master.gain.setTargetAtTime(levelToGain(level), at, FADE / 3);
  setPlaying(true);
  say('');
  clearTimeout(autoStop);
  autoStop = window.setTimeout(() => stop('Stopped after a minute. Press a button to play again.'), AUTO_STOP_SECONDS * 1000);
  cancelAnimationFrame(frame);
  paint();
  if (ctx.state !== 'running') say('The browser is not letting this page play sound yet. Check the volume and any mute switch, then press again.', true);
  if (!tracked) {
    tracked = true;
    // The usual single usage event: no tone, channel or level in it.
    trackToolRun({ tool: root.dataset.slug ?? 'speaker-test', outcome: 'ok', firstOk: true, files: 0, inputBytes: 0, ms: 0 });
    root.dispatchEvent(new CustomEvent('stayput:done'));
  }
}

function setLevel(value: number) {
  level = value;
  levelInput.value = String(value);
  levelText.textContent = `${value}%`;
  if (value <= CONFIRM_ABOVE) allowed = false;
  applyLevel();
}

levelInput.addEventListener('input', () => {
  const v = Number(levelInput.value);
  if (v > CONFIRM_ABOVE && !allowed) {
    // Hold the level where it was until the louder level is confirmed.
    pending = v;
    levelInput.value = String(level);
    confirmBox.hidden = false;
    return;
  }
  pending = undefined;
  confirmBox.hidden = true;
  setLevel(v);
});
$('spk-allow').addEventListener('click', () => {
  allowed = true;
  confirmBox.hidden = true;
  if (pending !== undefined) setLevel(pending);
  pending = undefined;
});
$('spk-keep').addEventListener('click', () => {
  pending = undefined;
  confirmBox.hidden = true;
});

toneBtn.addEventListener('click', () => (sound === 'tone' ? stop() : void play('tone')));
sweepBtn.addEventListener('click', () => (sound === 'sweep' ? stop() : void play('sweep')));
noiseBtn.addEventListener('click', () => (sound === 'noise' ? stop() : void play('noise')));
stopBtn.addEventListener('click', () => stop());
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="spk-channel"]')) {
  r.addEventListener('change', () => {
    if (ctx) applyChannel(ctx.currentTime);
    if (sound) nowText.textContent = describe();
  });
}
freqSel.addEventListener('change', () => {
  if (sound === 'tone' && source instanceof OscillatorNode && ctx) {
    source.frequency.setValueAtTime(Number(freqSel.value), ctx.currentTime);
    nowText.textContent = describe();
  }
});
// A steady tone left on in a background tab is a nuisance and a hearing risk.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && sound) stop('Stopped because the tab was hidden.');
});
window.addEventListener('pagehide', () => stop());
setPlaying(false);
