import { createShell, num } from '../lib/shell';
import { replaceExt } from '../lib/files';
import { channelsOf, decodeAudio, formatDuration } from '../lib/audio';
import { InputError, UnreadableFile } from '../lib/input-error';
import { fromWorkerFailure } from '../lib/worker-error';
import { halve, type TempoResult } from '../lib/bpm-key';
import { noteName } from '../lib/basic-pitch';
import { writeMidi, type MidiNote } from '../lib/midi';
import type { Reply, Request } from '../lib/basic-pitch.worker';
import type { Reply as BpmReply } from '../lib/bpm-key.worker';

/**
 * MP3 to MIDI: the notes in a recording, found by Spotify's Basic Pitch model
 * in a worker (src/lib/basic-pitch.worker.ts) and written as a Standard MIDI
 * File (src/lib/midi.ts). Nothing is uploaded; the model is fetched once.
 */

/** Longest file read, in seconds (a phone holds the decoded audio and the activations in memory). */
const MAX_SECONDS = 5 * 60;
/** Slack for the padding some encoders add, so a file that is exactly five minutes is not refused. */
const SLACK_SECONDS = 2;
/** Shortest clip the beat finder can say anything about. */
const MIN_TEMPO_SECONDS = 10;
const DEFAULT_BPM = 120;
const RATE = 44100;

const panel = document.getElementById('mm-panel')!;
const summaryEl = document.getElementById('mm-summary')!;
const tempoEl = document.getElementById('mm-tempo')!;
const roll = document.getElementById('mm-roll') as HTMLCanvasElement;
const playButton = document.getElementById('mm-play') as HTMLButtonElement;

let shown: MidiNote[] = [];

function drawRoll(notes: MidiNote[]) {
  const ctx = roll.getContext('2d')!;
  const { width, height } = roll;
  const css = getComputedStyle(roll);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = css.getPropertyValue('--surface').trim() || '#fff';
  ctx.fillRect(0, 0, width, height);
  if (notes.length === 0) return;
  const total = Math.max(...notes.map((n) => n.end));
  const lo = Math.min(...notes.map((n) => n.pitch)) - 1;
  const hi = Math.max(...notes.map((n) => n.pitch)) + 1;
  const rows = Math.max(12, hi - lo + 1);
  const h = height / rows;
  // Faint lines at each C, so the octaves can be told apart.
  ctx.fillStyle = 'rgba(128,128,128,0.18)';
  for (let p = lo; p < lo + rows; p++) if (p % 12 === 0) ctx.fillRect(0, height - (p - lo + 1) * h, width, h);
  ctx.fillStyle = css.getPropertyValue('--accent').trim() || '#2563eb';
  for (const n of notes) {
    const x = (n.start / total) * width;
    const w = Math.max(2, ((n.end - n.start) / total) * width);
    ctx.globalAlpha = 0.45 + 0.55 * (n.velocity / 127);
    ctx.fillRect(x, height - (n.pitch - lo + 1) * h, w, Math.max(2, h - 1));
  }
  ctx.globalAlpha = 1;
}

let audioCtx: AudioContext | undefined;
let stopPlayback: (() => void) | undefined;

function setPlaying(on: boolean) {
  playButton.textContent = on ? 'Stop' : 'Play';
}

function play() {
  if (stopPlayback) return stopPlayback();
  if (shown.length === 0) return;
  audioCtx ??= new AudioContext();
  const ctx = audioCtx;
  void ctx.resume();
  const t0 = ctx.currentTime + 0.1;
  const master = ctx.createGain();
  master.gain.value = 0.25;
  master.connect(ctx.destination);
  const sources: OscillatorNode[] = [];
  for (const n of shown) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 440 * 2 ** ((n.pitch - 69) / 12);
    const peak = 0.15 + 0.85 * (n.velocity / 127);
    const end = t0 + Math.max(n.end, n.start + 0.05);
    env.gain.setValueAtTime(0, t0 + n.start);
    env.gain.linearRampToValueAtTime(peak, t0 + n.start + 0.01);
    env.gain.setValueAtTime(peak, Math.max(t0 + n.start + 0.01, end - 0.04));
    env.gain.linearRampToValueAtTime(0, end);
    osc.connect(env).connect(master);
    osc.start(t0 + n.start);
    osc.stop(end + 0.01);
    sources.push(osc);
  }
  const last = Math.max(...shown.map((n) => n.end));
  const timer = window.setTimeout(() => stopPlayback?.(), (last + 0.3) * 1000);
  stopPlayback = () => {
    clearTimeout(timer);
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        // Already finished.
      }
    }
    master.disconnect();
    stopPlayback = undefined;
    setPlaying(false);
  };
  setPlaying(true);
}
playButton.addEventListener('click', play);

/** The file's length in seconds from its container, or null when that cannot be read without decoding. */
async function fileDuration(file: File): Promise<number | null> {
  try {
    const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const seconds = await input.computeDuration();
      return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    } finally {
      input.dispose?.();
    }
  } catch {
    return null;
  }
}

function checkLength(seconds: number) {
  if (seconds > MAX_SECONDS + SLACK_SECONDS) {
    const minutes = Math.round(seconds / 60);
    const long = minutes <= 5 ? 'just over 5 minutes' : `${minutes} minutes`;
    throw new InputError(`This file is ${long} long. This page reads files up to 5 minutes. Cut the part you want with Trim audio, then try again.`);
  }
}

let noteWorker: Worker | undefined;
let bpmWorker: Worker | undefined;
let nextId = 1;
/** The model has been fetched in this session, so later runs skip the download message. */
let modelReady = false;

function transcribe(audio: Float32Array, onLoading: (f: number) => void, onWindow: (done: number, total: number) => void) {
  noteWorker ??= new Worker(new URL('../lib/basic-pitch.worker.ts', import.meta.url), { type: 'module' });
  const w = noteWorker;
  const id = nextId++;
  return new Promise<{ notes: MidiNote[] }>((resolve, reject) => {
    const onMessage = (e: MessageEvent<Reply>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'loading') return onLoading(msg.fraction);
      if (msg.type === 'progress') return onWindow(msg.done, msg.total);
      done();
      if (msg.type === 'done') resolve(msg);
      else reject(fromWorkerFailure(msg.name, msg.message));
    };
    const onError = (e: ErrorEvent) => {
      done();
      noteWorker = undefined;
      reject(new Error(e.message || 'The note model stopped unexpectedly. The file may be too long for this device’s memory.'));
    };
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, audio } satisfies Request, [audio.buffer]);
  });
}

/** A tempo for the clip from the BPM finder's worker, or null when no steady beat is found. */
function estimateTempo(mono: Float32Array): Promise<TempoResult | null> {
  bpmWorker ??= new Worker(new URL('../lib/bpm-key.worker.ts', import.meta.url), { type: 'module' });
  const w = bpmWorker;
  const id = nextId++;
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent<BpmReply>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      resolve('error' in e.data ? null : e.data.tempo);
    };
    const onError = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      bpmWorker = undefined;
      resolve(null);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, mono }, [mono.buffer]);
  });
}

createShell({
  outputFormat: () => 'mid',
  autoDownloadSingle: false,
  resultsTitle: () => 'MIDI file ready',
  async process(files, progress) {
    const file = files[0]!.file;
    stopPlayback?.();
    panel.hidden = true;
    progress.set(`Reading ${file.name}…`, 0.01);
    // Refuse a long file from its header, before any of it is decoded.
    const known = await fileDuration(file);
    if (known !== null) checkLength(known);
    const buffer = await decodeAudio(file, RATE);
    const seconds = buffer.duration;
    if (known === null) checkLength(seconds);
    const [first] = channelsOf(buffer, true);
    const mono = first!.slice();
    let peak = 0;
    for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]!));
    if (peak < 0.001) throw new UnreadableFile('This file is silent, so there are no notes to find.');
    if (seconds < 0.5) throw new InputError('This clip is too short to hold a note. Use a clip of at least half a second.');

    const typed = Math.round(num('bpm', 0));
    const tempoGuess = typed === 0 && seconds >= MIN_TEMPO_SECONDS ? estimateTempo(mono.slice()) : Promise.resolve(null);
    const audio = halve(mono);

    const started = performance.now();
    let firstWindowAt = 0;
    const result = await transcribe(
      audio,
      (f) => {
        if (!modelReady) progress.set(`Downloading the note model and its engine, once: ${Math.round(f * 100)}%`, 0.02 + 0.08 * f);
      },
      (done, total) => {
        modelReady = true;
        if (done === 0) {
          firstWindowAt = performance.now();
          progress.set(`Finding notes in ${file.name}…`, 0.1);
          return;
        }
        const each = (performance.now() - (firstWindowAt || started)) / done / 1000;
        const left = Math.round(each * (total - done));
        progress.set(`Finding notes: ${Math.round((done / total) * 100)}%${done < total && left >= 5 ? `, about ${left} seconds left` : ''}`, 0.1 + 0.8 * (done / total));
      },
    );
    const { notes } = result;
    if (notes.length === 0) throw new InputError('No notes were found in this file. It may be too quiet, or made of noise, speech or drums, which have no steady pitch.');

    progress.set('Writing the MIDI file…', 0.95);
    const guess = await tempoGuess;
    const bpm = typed >= 30 && typed <= 300 ? typed : guess ? Math.round(guess.bpm) : DEFAULT_BPM;
    const source = typed >= 30 && typed <= 300 ? 'the tempo you typed' : guess ? 'a tempo estimated from the audio, which is a guess' : `${DEFAULT_BPM} BPM, a default, because no steady beat could be found`;
    const bytes = writeMidi(notes, bpm);

    shown = notes;
    drawRoll(notes);
    const low = Math.min(...notes.map((n) => n.pitch));
    const high = Math.max(...notes.map((n) => n.pitch));
    summaryEl.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'} from ${noteName(low)} to ${noteName(high)} in ${formatDuration(seconds)} of audio. Expect to fix some notes by ear.`;
    tempoEl.textContent = `The file is set to ${bpm} BPM: ${source}.`;
    setPlaying(false);
    panel.hidden = false;
    progress.set('Done', 1);

    return [
      {
        name: replaceExt(file.name, 'mid'),
        blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/midi' }),
        originalSize: undefined,
        badge: 'MID',
        note: `${notes.length} notes, ${bpm} BPM, found in ${formatDuration((performance.now() - started) / 1000)} on the CPU`,
      },
    ];
  },
});
