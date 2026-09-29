import { createShell } from '../lib/shell';
import { trackToolRun } from '../lib/analytics';

/**
 * Microphone test. The level is measured in the page from the live input
 * (Web Audio), and the optional five-second check is recorded and played back
 * from memory. Nothing is saved or sent anywhere.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = $('tool');
const panel = $('mic-panel');
const idle = $('mic-idle');
const live = $('mic-live');
const verdict = $('mic-verdict');
const fill = $('mic-fill');
const peakMark = $('mic-peak');
const dbText = $('mic-db');
const startBtn = $<HTMLButtonElement>('mic-start');
const recordBtn = $<HTMLButtonElement>('mic-record');
const stopBtn = $<HTMLButtonElement>('mic-stop');
const audio = $<HTMLAudioElement>('mic-audio');
const device = $<HTMLSelectElement>('mic-device');
const facts = $('mic-facts');
const note = $('mic-note');

// The shell supplies the privacy panel and next steps; files are never added here.
createShell({ process: async () => [] });

const FLOOR = -60; // dBFS at the left of the meter
const RECORD_SECONDS = 5;

let stream: MediaStream | undefined;
let ctx: AudioContext | undefined;
let analyser: AnalyserNode | undefined;
let frame = 0;
let held = FLOOR; // peak hold, falls slowly
let loudest = FLOOR;
let recentQuiet = 0; // frames in a row below the "hearing you" level
let playUrl: string | undefined;
let tracked = false;

function say(text: string, warn = false) {
  note.textContent = text;
  note.classList.toggle('is-warn', warn);
}

const toDb = (v: number) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const pos = (db: number) => `${Math.max(0, Math.min(100, ((db - FLOOR) / -FLOOR) * 100))}%`;

function measure() {
  frame = requestAnimationFrame(measure);
  if (!analyser) return;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  let peak = 0;
  for (const v of buf) {
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const rms = toDb(Math.sqrt(sum / buf.length));
  const pk = toDb(peak);
  held = Math.max(pk, held - 0.4);
  loudest = Math.max(loudest, pk);
  fill.style.width = pos(rms);
  peakMark.style.left = pos(held);
  dbText.textContent = `${Number.isFinite(rms) ? Math.round(rms) : '-∞'} dB average, ${Number.isFinite(held) ? Math.round(held) : '-∞'} dB peak`;
  recentQuiet = rms > -50 ? 0 : recentQuiet + 1;
  let v: 'ok' | 'quiet' | 'loud' | 'silent';
  if (held >= -1) v = 'loud';
  else if (rms > -50) v = 'ok';
  else if (loudest < -70) v = 'silent';
  else v = 'quiet';
  if (panel.dataset.verdict !== v && (v !== 'quiet' || recentQuiet > 90)) {
    panel.dataset.verdict = v;
    verdict.textContent = {
      ok: 'Your microphone works. We can hear you.',
      quiet: 'Working, but quiet. Speak up, move closer, or raise the input volume.',
      loud: 'Too loud: the sound is clipping. Turn the input volume down or move back.',
      silent: 'Silence. Say something; if the bar stays empty, check the microphone is not muted.',
    }[v];
    if (v === 'ok' && !tracked) {
      tracked = true;
      trackToolRun({ tool: root.dataset.slug ?? 'mic-test', outcome: 'ok', firstOk: true, files: 0, inputBytes: 0, ms: 0, format: 'mic' });
      root.dispatchEvent(new CustomEvent('stayput:done'));
    }
  }
}

async function listDevices() {
  try {
    const mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default');
    const chosen = device.value;
    device.length = 1;
    mics.forEach((d, i) => device.add(new Option(d.label || `Microphone ${i + 1}`, d.deviceId)));
    device.value = mics.some((d) => d.deviceId === chosen) ? chosen : '';
  } catch {
    // Device names are optional.
  }
}

function release() {
  cancelAnimationFrame(frame);
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = undefined;
  void ctx?.close();
  ctx = undefined;
  analyser = undefined;
}

function setState(state: 'idle' | 'live' | 'recording') {
  panel.dataset.state = state;
  idle.hidden = state !== 'idle';
  live.hidden = state === 'idle';
  startBtn.hidden = state !== 'idle';
  recordBtn.hidden = state === 'idle';
  recordBtn.disabled = state === 'recording';
  stopBtn.hidden = state === 'idle';
  facts.hidden = state === 'idle';
}

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) {
    say('This browser cannot use a microphone in web pages. Recent Chrome, Edge, Firefox and Safari can.', true);
    return;
  }
  release();
  say('');
  try {
    // The raw input, without the browser's clean-up, so the test shows what the microphone really picks up.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: device.value ? { exact: device.value } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    say(
      name === 'NotAllowedError'
        ? 'The microphone is blocked for this page. Allow it from the icon at the left of the address bar (or in your system privacy settings), then try again.'
        : name === 'NotFoundError'
          ? 'No microphone was found. Plug one in, or check it is switched on and not disabled in your system settings.'
          : name === 'NotReadableError'
            ? 'The microphone is in use by another app or blocked by the system. Close other apps that use it and try again.'
            : `The microphone could not start: ${e instanceof Error ? e.message : String(e)}`,
      true,
    );
    return;
  }
  await listDevices();
  const track = stream.getAudioTracks()[0];
  const settings = track?.getSettings() ?? {};
  if (settings.deviceId && [...device.options].some((o) => o.value === settings.deviceId)) device.value = settings.deviceId;
  $('mic-name').textContent = track?.label || 'Default microphone';
  ctx = new AudioContext();
  $('mic-rate').textContent = `${((settings.sampleRate ?? ctx.sampleRate) / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} kHz`;
  $('mic-channels').textContent = settings.channelCount === 2 ? 'Stereo' : settings.channelCount === 1 ? 'Mono' : '–';
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);
  held = FLOOR;
  loudest = FLOOR;
  recentQuiet = 0;
  delete panel.dataset.verdict;
  verdict.textContent = 'Listening… say something.';
  setState('live');
  measure();
}

function record() {
  if (!stream || typeof MediaRecorder === 'undefined') return;
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.onstop = () => {
    if (playUrl) URL.revokeObjectURL(playUrl);
    playUrl = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
    audio.src = playUrl;
    audio.hidden = false;
    recordBtn.textContent = 'Record 5 seconds and play back';
    if (stream) setState('live');
    void audio.play().catch(() => {});
    say('This is how you sound. Use headphones if you hear an echo.');
  };
  rec.start();
  setState('recording');
  let left = RECORD_SECONDS;
  recordBtn.textContent = `Recording… ${left}`;
  const timer = setInterval(() => {
    left--;
    if (left > 0) recordBtn.textContent = `Recording… ${left}`;
    else {
      clearInterval(timer);
      if (rec.state !== 'inactive') rec.stop();
    }
  }, 1000);
}

startBtn.addEventListener('click', () => void start());
recordBtn.addEventListener('click', record);
stopBtn.addEventListener('click', () => {
  release();
  setState('idle');
  say('The microphone is off.');
});
device.addEventListener('change', () => {
  if (stream) void start();
});
setState('idle');
