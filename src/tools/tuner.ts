import { createShell } from '../lib/shell';
import { trackToolRun } from '../lib/analytics';
import { detectPitch, instrumentById, midiToFreq, nearestString, noteFor, noteLabel } from '../lib/tuner';

/**
 * Tuner. The live microphone input is read in the page (Web Audio) and its
 * pitch measured several times a second; nothing is recorded or sent. The
 * string buttons play each reference note from an oscillator.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const panel = $('tuner-panel');
const idle = $('tuner-idle');
const live = $('tuner-live');
const nameEl = $('tuner-name');
const octaveEl = $('tuner-octave');
const needle = $('tuner-needle');
const hint = $('tuner-hint');
const freqEl = $('tuner-freq');
const stringsEl = $('tuner-strings');
const startBtn = $<HTMLButtonElement>('tuner-start');
const stopBtn = $<HTMLButtonElement>('tuner-stop');
const instrumentSel = $<HTMLSelectElement>('instrument');
const a4Input = $<HTMLInputElement>('a4');
const message = $('tuner-message');

// The shell supplies the privacy panel and next steps; files are never added here.
createShell({ process: async () => [] });

const IN_TUNE = 5; // cents either side that count as in tune
const HOLD_MS = 1200; // keep showing the last note this long after the sound stops

let stream: MediaStream | undefined;
let ctx: AudioContext | undefined;
let analyser: AnalyserNode | undefined;
let timer = 0;
let recent: number[] = [];
let lastHeard = 0;
let tunedSince = 0;
let tracked = false;
let toneCtx: AudioContext | undefined;

const a4 = () => {
  const v = Number(a4Input.value);
  return v >= 415 && v <= 466 ? v : 440;
};
const instrument = () => instrumentById(instrumentSel.value);

function say(text: string, warn = false) {
  message.textContent = text;
  message.classList.toggle('is-warn', warn);
}

function drawStrings() {
  stringsEl.replaceChildren(
    ...instrument().strings.map((midi, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tuner-string';
      b.dataset.index = String(i);
      b.textContent = noteLabel(midi);
      b.title = `Play ${noteLabel(midi)} (${midiToFreq(midi, a4()).toFixed(2)} Hz)`;
      b.addEventListener('click', () => playReference(midi));
      return b;
    }),
  );
}

/** Two seconds of the note, a soft plucked-sounding tone. */
function playReference(midi: number) {
  toneCtx ??= new AudioContext();
  const t = toneCtx.currentTime;
  const osc = toneCtx.createOscillator();
  const gain = toneCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = midiToFreq(midi, a4());
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 2);
  osc.connect(gain).connect(toneCtx.destination);
  osc.start(t);
  osc.stop(t + 2.05);
}

function showSilence() {
  panel.dataset.signal = 'none';
  delete panel.dataset.tuned;
  hint.textContent = instrument().strings.length ? 'Play one string at a time' : 'Play or sing one note';
  for (const b of stringsEl.querySelectorAll<HTMLElement>('.tuner-string')) {
    delete b.dataset.active;
    delete b.dataset.tuned;
  }
}

function listen() {
  if (!analyser || !ctx) return;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  const pitch = detectPitch(buf, ctx.sampleRate);
  const now = performance.now();
  if (!pitch) {
    if (now - lastHeard > HOLD_MS && panel.dataset.signal !== 'none') {
      recent = [];
      showSilence();
    }
    return;
  }
  // A jump of more than a semitone starts a new note; otherwise smooth with the median of the last readings.
  if (recent.length && Math.abs(1200 * Math.log2(pitch.freq / recent[recent.length - 1]!)) > 100) recent = [];
  recent.push(pitch.freq);
  if (recent.length > 5) recent.shift();
  const freq = [...recent].sort((x, y) => x - y)[Math.floor(recent.length / 2)]!;
  lastHeard = now;
  const strings = instrument().strings;
  const target = strings.length ? nearestString(freq, strings, a4()) : undefined;
  // For an instrument the needle shows the distance to the nearest open string; otherwise to the nearest note.
  const note = noteFor(freq, a4());
  const shownMidi = target ? strings[target.index]! : note.midi;
  const cents = target ? target.cents : note.cents;
  const label = noteLabel(shownMidi);
  nameEl.textContent = label.replace(/-?\d+$/, '');
  octaveEl.textContent = label.match(/-?\d+$/)![0];
  const clamped = Math.max(-50, Math.min(50, cents));
  needle.style.left = `${50 + clamped}%`;
  const tuned = Math.abs(cents) <= IN_TUNE;
  panel.dataset.signal = 'yes';
  if (tuned) tunedSince ||= now;
  else tunedSince = 0;
  const holding = tuned && now - tunedSince > 400;
  panel.dataset.tuned = String(holding);
  const off = Math.round(Math.abs(cents));
  hint.textContent = tuned ? 'In tune' : cents > 0 ? `${off} cents sharp: tune down` : `${off} cents flat: tune up`;
  freqEl.textContent = `${freq.toFixed(1)} Hz${target ? `, target ${midiToFreq(shownMidi, a4()).toFixed(1)} Hz` : ''}`;
  stringsEl.querySelectorAll<HTMLElement>('.tuner-string').forEach((b, i) => {
    const active = target?.index === i;
    if (active) b.dataset.active = 'true';
    else delete b.dataset.active;
    if (active && holding) b.dataset.tuned = 'true';
    else if (active) delete b.dataset.tuned;
  });
  if (!tracked) {
    tracked = true;
    trackToolRun({ tool: root.dataset.slug ?? 'tuner', outcome: 'ok', firstOk: true, files: 0, inputBytes: 0, ms: 0, format: instrument().id });
    root.dispatchEvent(new CustomEvent('stayput:done'));
  }
}

function release() {
  clearInterval(timer);
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = undefined;
  void ctx?.close();
  ctx = undefined;
  analyser = undefined;
}

function setState(state: 'idle' | 'live') {
  panel.dataset.state = state;
  idle.hidden = state !== 'idle';
  live.hidden = state === 'idle';
  startBtn.hidden = state !== 'idle';
  stopBtn.hidden = state === 'idle';
}

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) {
    say('This browser cannot use a microphone in web pages. Recent Chrome, Edge, Firefox and Safari can.', true);
    return;
  }
  release();
  say('');
  try {
    // Noise suppression and automatic gain smear the pitch of a held note, so they are turned off.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    say(
      name === 'NotAllowedError'
        ? 'The microphone is blocked for this page. Allow it from the icon at the left of the address bar (or in your system privacy settings), then try again. You can still press a string to hear its note and tune by ear.'
        : name === 'NotFoundError'
          ? 'No microphone was found. Plug one in or switch it on. You can still press a string to hear its note and tune by ear.'
          : name === 'NotReadableError'
            ? 'The microphone is in use by another app or blocked by the system. Close other apps that use it and try again.'
            : `The microphone could not start: ${e instanceof Error ? e.message : String(e)}`,
      true,
    );
    return;
  }
  ctx = new AudioContext();
  analyser = ctx.createAnalyser();
  // About 85 ms of sound at 48 kHz: several periods of a bass's low E.
  analyser.fftSize = 4096;
  ctx.createMediaStreamSource(stream).connect(analyser);
  recent = [];
  lastHeard = 0;
  tunedSince = 0;
  nameEl.textContent = '–';
  octaveEl.textContent = '';
  needle.style.left = '50%';
  freqEl.textContent = '– Hz';
  showSilence();
  setState('live');
  timer = window.setInterval(listen, 50);
}

startBtn.addEventListener('click', () => void start());
stopBtn.addEventListener('click', () => {
  release();
  setState('idle');
  say('The microphone is off.');
});
instrumentSel.addEventListener('change', () => {
  drawStrings();
  recent = [];
  if (stream) showSilence();
});
a4Input.addEventListener('change', drawStrings);
drawStrings();
setState('idle');
