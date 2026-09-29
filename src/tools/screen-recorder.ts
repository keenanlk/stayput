import { bool, createShell, num } from '../lib/shell';
import type { OutputFile } from '../lib/files';
import { canRecordScreen, clock, finishRecording, mixAudio, pickType, recordingName } from '../lib/screen-record';

/**
 * Screen recorder. The browser's screen picker chooses what to share; the
 * browser's MediaRecorder writes the video in this tab. When recording stops,
 * the file goes into the tool like a dropped file and is finished (its length
 * written so it can be seeked) and offered for download. Nothing is uploaded.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const screen = $('rec-screen');
const preview = $<HTMLVideoElement>('rec-preview');
const idle = $('rec-idle');
const live = $('rec-live');
const time = $('rec-time');
const startBtn = $<HTMLButtonElement>('rec-start');
const pauseBtn = $<HTMLButtonElement>('rec-pause');
const stopBtn = $<HTMLButtonElement>('rec-stop');
const note = $('rec-note');

let recorder: MediaRecorder | undefined;
let streams: MediaStream[] = [];
let closeMix = () => {};
let chunks: Blob[] = [];
let ext: 'mp4' | 'webm' = 'webm';
let elapsed = 0; // ms recorded before the current run
let since = 0; // when the current run started, 0 while paused
let ticker: number | undefined;
let previewUrl: string | undefined;
const recorded = new WeakSet<File>();

function say(text: string, warn = false) {
  note.textContent = text;
  note.classList.toggle('is-warn', warn);
}

function setState(state: 'idle' | 'live' | 'paused' | 'done') {
  screen.dataset.state = state;
  const recording = state === 'live' || state === 'paused';
  startBtn.hidden = recording;
  startBtn.textContent = state === 'done' ? 'Record again' : 'Start recording';
  pauseBtn.hidden = !recording;
  pauseBtn.textContent = state === 'paused' ? 'Resume' : 'Pause';
  stopBtn.hidden = !recording;
  live.hidden = !recording;
  idle.hidden = state !== 'idle';
  preview.hidden = state === 'idle';
  for (const id of ['rec-system', 'rec-mic', 'rec-fps']) ($(id) as HTMLInputElement).disabled = recording;
}

const seconds = () => (elapsed + (since ? performance.now() - since : 0)) / 1000;
const tick = () => (time.textContent = clock(seconds()));

function showPreview(src: MediaStream | Blob) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  if (src instanceof MediaStream) {
    preview.srcObject = src;
    preview.muted = true;
    preview.controls = false;
    void preview.play().catch(() => {});
  } else {
    preview.srcObject = null;
    previewUrl = URL.createObjectURL(src);
    preview.src = previewUrl;
    preview.muted = false;
    preview.controls = true;
  }
}

function release() {
  for (const s of streams) for (const t of s.getTracks()) t.stop();
  streams = [];
  closeMix();
  closeMix = () => {};
  if (ticker) clearInterval(ticker);
  ticker = undefined;
}

async function start() {
  if (!canRecordScreen()) {
    say('This browser cannot record the screen. Phones and tablets do not allow it; on a computer, Chrome, Edge, Firefox and Safari all can.', true);
    return;
  }
  say('');
  shell.hideError();
  const wantSystem = bool('rec-system');
  const wantMic = bool('rec-mic');
  const fps = num('rec-fps', 30);
  let display: MediaStream;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: fps } }, audio: wantSystem });
  } catch (e) {
    // Closing the picker or pressing Cancel lands here; that is not an error worth shouting about.
    const name = e instanceof DOMException ? e.name : '';
    say(name === 'NotAllowedError' || name === 'AbortError' ? 'Nothing was shared, so recording did not start.' : `Recording could not start: ${e instanceof Error ? e.message : String(e)}`, name !== 'NotAllowedError' && name !== 'AbortError');
    return;
  }
  streams = [display];
  const sound: MediaStreamTrack[] = [...display.getAudioTracks()];
  const warnings: string[] = [];
  if (wantSystem && sound.length === 0) warnings.push('No sound was shared with the screen. To include it, share a tab or your entire screen and tick "Share audio" in the browser\'s picker.');
  if (wantMic) {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streams.push(mic);
      sound.push(...mic.getAudioTracks());
    } catch {
      warnings.push('The microphone was not allowed, so the recording has no voice.');
    }
  }
  const mix = mixAudio(sound);
  closeMix = mix.close;
  const stream = new MediaStream([...display.getVideoTracks(), ...(mix.track ? [mix.track] : [])]);
  const type = pickType();
  ext = type.ext;
  chunks = [];
  try {
    recorder = new MediaRecorder(stream, type.mimeType ? { mimeType: type.mimeType } : undefined);
  } catch (e) {
    release();
    say(`This browser cannot record this screen: ${e instanceof Error ? e.message : String(e)}`, true);
    return;
  }
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = () => void finish();
  // Pressing the browser's own "Stop sharing" ends the recording too.
  display.getVideoTracks()[0]?.addEventListener('ended', () => stop());
  recorder.start(1000);
  elapsed = 0;
  since = performance.now();
  ticker = window.setInterval(tick, 250);
  tick();
  showPreview(display);
  setState('live');
  if (warnings.length) say(warnings.join(' '), true);
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
  tick();
}

async function finish() {
  const mimeType = recorder?.mimeType || (ext === 'mp4' ? 'video/mp4' : 'video/webm');
  recorder = undefined;
  release();
  const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
  chunks = [];
  if (!blob.size) {
    setState('idle');
    say('The recording came out empty. Try again, and keep it going for at least a second.', true);
    return;
  }
  const file = new File([blob], recordingName(ext), { type: blob.type });
  recorded.add(file);
  showPreview(blob);
  setState('done');
  await shell.addFiles([file]);
  await shell.execute();
}

const shell = createShell({
  autoDownloadSingle: false,
  outputFormat: () => ext,
  resultsTitle: () => 'Your recording is ready',
  async process(files, progress) {
    const file = files[0]!.file;
    progress.set('Finishing the recording…', 0.3);
    const kind = /\.mp4$|\/mp4/i.test(file.name + file.type) ? 'mp4' : 'webm';
    const done = await finishRecording(file, kind);
    progress.set('Done', 1);
    if (recorded.has(file)) showPreview(done.blob);
    const out: OutputFile = {
      name: file.name,
      blob: done.blob,
      note: [done.duration !== undefined ? clock(done.duration) : '', kind.toUpperCase()].filter(Boolean).join(', '),
    };
    return [out];
  },
});

startBtn.addEventListener('click', () => void start());
stopBtn.addEventListener('click', stop);
pauseBtn.addEventListener('click', togglePause);
setState('idle');
if (!canRecordScreen()) {
  startBtn.disabled = true;
  say('This browser cannot record the screen. Phones and tablets do not allow it; on a computer, Chrome, Edge, Firefox and Safari all can.', true);
}
