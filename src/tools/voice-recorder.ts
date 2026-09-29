import { bool, createShell, str } from '../lib/shell';
import { replaceExt, type OutputFile } from '../lib/files';
import { formatDuration } from '../lib/audio';
import { FORMAT_LABELS, canWrite, convertAudio, type AudioFormat } from '../lib/audio-convert';

/**
 * Voice recorder. The browser's MediaRecorder captures the microphone in this
 * tab; when recording stops, the file goes into the tool like a dropped file
 * and is written as MP3, WAV or M4A by the audio converter's code. Nothing is
 * uploaded.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const deck = $('vr-deck');
const meter = $<HTMLCanvasElement>('vr-meter');
const idle = $('vr-idle');
const time = $('vr-time');
const audio = $<HTMLAudioElement>('vr-audio');
const startBtn = $<HTMLButtonElement>('vr-start');
const pauseBtn = $<HTMLButtonElement>('vr-pause');
const stopBtn = $<HTMLButtonElement>('vr-stop');
const device = $<HTMLSelectElement>('vr-device');
const note = $('vr-note');

const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
const format = () => str('vr-format', 'mp3') as AudioFormat;

let recorder: MediaRecorder | undefined;
let stream: MediaStream | undefined;
let ctx: AudioContext | undefined;
let analyser: AnalyserNode | undefined;
let chunks: Blob[] = [];
let elapsed = 0;
let since = 0;
let frame = 0;
let levels: number[] = [];
let audioUrl: string | undefined;

function say(text: string, warn = false) {
  note.textContent = text;
  note.classList.toggle('is-warn', warn);
}

function setState(state: 'idle' | 'live' | 'paused' | 'done') {
  deck.dataset.state = state;
  const recording = state === 'live' || state === 'paused';
  startBtn.hidden = recording;
  startBtn.textContent = state === 'done' ? 'Record again' : 'Start recording';
  pauseBtn.hidden = !recording;
  pauseBtn.textContent = state === 'paused' ? 'Resume' : 'Pause';
  stopBtn.hidden = !recording;
  idle.hidden = state !== 'idle';
  time.hidden = state === 'idle';
  if (recording) audio.hidden = true;
  for (const el of [device, $('vr-clean') as HTMLInputElement]) el.disabled = recording;
}

const seconds = () => (elapsed + (since ? performance.now() - since : 0)) / 1000;
const clock = (s: number) => {
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

/** A scrolling bar meter of the microphone level, newest on the right. */
function draw() {
  frame = requestAnimationFrame(draw);
  time.textContent = clock(seconds());
  if (!analyser) return;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(meter.clientWidth * dpr));
  const h = Math.round(96 * dpr);
  if (meter.width !== w || meter.height !== h) {
    meter.width = w;
    meter.height = h;
  }
  const bar = 4 * dpr;
  const count = Math.floor(w / bar);
  if (recorder?.state === 'recording') levels.push(Math.min(1, Math.sqrt(peak)));
  if (levels.length > count) levels = levels.slice(-count);
  const g = meter.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1f6f5c';
  const start = count - levels.length;
  levels.forEach((l, i) => {
    const bh = Math.max(2 * dpr, l * (h - 8 * dpr));
    g.fillRect((start + i) * bar, (h - bh) / 2, bar * 0.6, bh);
  });
}

async function listDevices() {
  try {
    const mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default');
    const chosen = device.value;
    device.length = 1;
    mics.forEach((d, i) => device.add(new Option(d.label || `Microphone ${i + 1}`, d.deviceId)));
    device.value = mics.some((d) => d.deviceId === chosen) ? chosen : '';
  } catch {
    // Device names are optional; the default microphone still works.
  }
}

function release() {
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = undefined;
  void ctx?.close();
  ctx = undefined;
  analyser = undefined;
  cancelAnimationFrame(frame);
}

async function start() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    say('This browser cannot record sound. Recent Chrome, Edge, Firefox and Safari can, on phones too.', true);
    return;
  }
  say('');
  shell.hideError();
  const clean = bool('vr-clean');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: device.value ? { exact: device.value } : undefined, echoCancellation: clean, noiseSuppression: clean, autoGainControl: clean },
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    say(
      name === 'NotAllowedError'
        ? 'The microphone is blocked for this page. Allow it from the icon at the left of the address bar, then press Start again.'
        : name === 'NotFoundError'
          ? 'No microphone was found. Plug one in or choose another in your system settings.'
          : `The microphone could not start: ${e instanceof Error ? e.message : String(e)}`,
      true,
    );
    return;
  }
  void listDevices();
  ctx = new AudioContext();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  chunks = [];
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = () => void finish();
  recorder.start(1000);
  elapsed = 0;
  since = performance.now();
  levels = [];
  cancelAnimationFrame(frame);
  draw();
  setState('live');
}

function stop() {
  if (!recorder || recorder.state === 'inactive') return;
  if (since) elapsed += performance.now() - since;
  since = 0;
  recorder.stop();
}

function togglePause() {
  if (!recorder) return;
  if (recorder.state === 'recording') {
    recorder.pause();
    elapsed += performance.now() - since;
    since = 0;
    setState('paused');
  } else if (recorder.state === 'paused') {
    recorder.resume();
    since = performance.now();
    setState('live');
  }
}

function stamp(at = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`;
}

async function finish() {
  const type = (recorder?.mimeType || 'audio/webm').split(';')[0]!;
  recorder = undefined;
  release();
  time.textContent = clock(elapsed / 1000);
  const blob = new Blob(chunks, { type });
  chunks = [];
  if (!blob.size) {
    setState('idle');
    say('The recording came out empty. Try again, and keep it going for at least a second.', true);
    return;
  }
  const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
  setState('done');
  await shell.addFiles([new File([blob], `voice-recording-${stamp()}.${ext}`, { type })]);
  await shell.execute();
}

const shell = createShell({
  autoDownloadSingle: false,
  outputFormat: format,
  resultsTitle: () => 'Your recording is ready',
  async process(files, progress) {
    const file = files[0]!.file;
    let fmt = format();
    let fallback = '';
    if (!(await canWrite(fmt, 1))) {
      fallback = `This browser cannot write ${FORMAT_LABELS[fmt]}, so it was saved as MP3. `;
      fmt = 'mp3';
    }
    progress.set('Reading the recording…', 0.05);
    const r = await convertAudio(file, fmt, {
      bitrate: 128,
      mono: true,
      onProgress: (f) => progress.set(`Saving as ${fmt.toUpperCase()}: ${Math.round(f * 100)}%`, 0.1 + f * 0.9),
    });
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(r.blob);
    audio.src = audioUrl;
    audio.hidden = false;
    if (fallback) say(fallback.trim(), true);
    const out: OutputFile = {
      name: replaceExt(file.name, fmt),
      blob: r.blob,
      note: `${formatDuration(r.duration)}, ${FORMAT_LABELS[fmt]}${fmt === 'wav' ? '' : ', 128 kbps'}, mono`,
    };
    return [out];
  },
});

startBtn.addEventListener('click', () => void start());
stopBtn.addEventListener('click', stop);
pauseBtn.addEventListener('click', togglePause);
setState('idle');
void listDevices();
