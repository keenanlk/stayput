// @webkit-project
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { recognisePieces, type PieceDeps } from '../src/lib/speech-resume';
import type { Segment } from '../src/lib/captions';

/**
 * A speech run that loses its worker, or its page, after the first piece picks up again from the last finished piece
 * and keeps what was done; a run that still fails hands over a partial transcript. The speech worker is faked where a
 * failure has to happen on cue (a real phone running out of memory cannot be reproduced here); the recording is made
 * in the test, because CI has no ffmpeg: a WAV of about 80 seconds with a pause every 20, which is four pieces.
 */
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
const runs = async (page: Page) => (await events(page)).filter((e) => e.n === 'tool_run').map((e) => e.d);

type Plan = 'ok' | 'die' | 'hidden';
type Win = { __spawned: number; __asked: number; __plan: Plan[]; __okCount: number; __hidden: boolean; Worker: unknown };

async function recordEvents(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

/**
 * The 8-bit speech worker, answering each request the way `window.__plan` says (one entry per request, the last one
 * repeating). A result is "Piece n" for the n-th piece answered, so the cues show their order. `hidden` hides the page
 * (as an app switch does) and answers SpeechModelError, as a worker the browser stopped in the background does.
 */
async function fakeSpeechWorker(page: Page, plan: Plan[]) {
  await page.addInitScript((plan) => {
    const w = window as unknown as Win;
    w.__spawned = 0;
    w.__asked = 0;
    w.__okCount = 0;
    w.__plan = JSON.parse(sessionStorage.getItem('__plan') ?? 'null') ?? plan;
    w.__hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => w.__hidden, configurable: true });
    // Safari has WebGPU on a computer: this is the 8-bit path, whose worker is the one faked below.
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    const Real = window.Worker;
    w.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!/transcribe\.worker/.test(String(url))) return new Real(url, options);
        super(url, options);
        w.__spawned++;
        const fake = new EventTarget() as EventTarget & { postMessage(msg: { id: number }): void; terminate(): void };
        fake.postMessage = ({ id }) => {
          const step = w.__plan[Math.min(w.__asked++, w.__plan.length - 1)];
          if (step === 'die') return void setTimeout(() => fake.dispatchEvent(new Event('error')), 0);
          if (step === 'hidden') {
            w.__hidden = true;
            document.dispatchEvent(new Event('visibilitychange'));
            return void setTimeout(() => fake.dispatchEvent(new MessageEvent('message', { data: { id, type: 'error', name: 'SpeechModelError', message: 'forced by the test' } })), 0);
          }
          const n = ++w.__okCount;
          setTimeout(() => fake.dispatchEvent(new MessageEvent('message', { data: { id, type: 'result', chunks: [{ start: 0, end: 1, text: ` Piece ${n}.` }], language: 'en' } })), 0);
        };
        fake.terminate = () => {};
        return fake as unknown as Worker;
      }
    };
  }, plan);
}

const asked = (page: Page) => page.evaluate(() => (window as unknown as Win).__asked);
const spawned = (page: Page) => page.evaluate(() => (window as unknown as Win).__spawned);

/** 8 kHz mono 16-bit PCM: loud tone with a 0.6 s pause every 20 s, so the cut points fall at the pauses. */
function wav(seconds: number): Buffer {
  const rate = 8000;
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const pause = t % 20 > 19.4;
    // A tone with a slow wobble: it is sound to the cutter, and not a pure silence anywhere but in the pauses.
    buf.writeInt16LE(pause ? 0 : Math.round(9000 * Math.sin(i * 0.3) * (0.6 + 0.4 * Math.sin(t * 3))), 44 + i * 2);
  }
  return buf;
}
const sound = (seconds = 80) => ({ name: 'talk-80s.wav', mimeType: 'audio/wav', buffer: wav(seconds) });

/** A video of `seconds` with that sound, made in the page with the browser's own encoders (Chromium only; WebKit's encoders differ). */
async function makeVideo(page: Page, seconds: number) {
  // Served from the page's own origin: the page's script policy allows no blob: modules.
  const lib = readFileSync(fileURLToPath(new URL('../node_modules/mediabunny/dist/bundles/mediabunny.min.mjs', import.meta.url)), 'utf8');
  await page.route('**/__mediabunny.mjs', (route) => route.fulfill({ contentType: 'text/javascript', body: lib }));
  const base64 = await page.evaluate(
    async ({ seconds, tone }) => {
      const url = '/__mediabunny.mjs';
      const mb = await import(url);
      const output = new mb.Output({ format: new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
      const canvas = new OffscreenCanvas(64, 64);
      const ctx = canvas.getContext('2d')!;
      const video = new mb.CanvasSource(canvas, { codec: 'vp8', bitrate: 100_000 });
      const audio = new mb.AudioBufferSource({ codec: 'opus', bitrate: 24_000 });
      output.addVideoTrack(video, { frameRate: 2 });
      output.addAudioTrack(audio);
      await output.start();
      for (let f = 0; f < seconds * 2; f++) {
        ctx.fillStyle = `hsl(${f * 7 % 360} 70% 50%)`;
        ctx.fillRect(0, 0, 64, 64);
        await video.add(f / 2, 0.5);
      }
      const rate = 16000;
      const data = new Float32Array(seconds * rate);
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        data[i] = t % 20 > 19.4 ? 0 : 0.3 * Math.sin(i * tone) * (0.6 + 0.4 * Math.sin(t * 3));
      }
      const buffer = new AudioBuffer({ length: data.length, sampleRate: rate, numberOfChannels: 1 });
      buffer.copyToChannel(data, 0);
      await audio.add(buffer);
      await output.finalize();
      const bytes = new Uint8Array(output.target.buffer!);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { seconds, tone: 0.15 },
  );
  return { name: 'talk-80s.webm', mimeType: 'video/webm', buffer: Buffer.from(base64, 'base64') };
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

/** Runs once with every piece answered, to count the pieces this recording is cut into; leaves the page ready for the real run. */
async function countPieces(page: Page, file: Parameters<ReturnType<Page['locator']>['setInputFiles']>[0], plan: Plan[]) {
  await page.evaluate(() => ((window as unknown as Win).__plan = ['ok']));
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  const pieces = await asked(page);
  expect(pieces).toBeGreaterThanOrEqual(3);
  // A fresh page, so the next run starts its own worker, as a first run does.
  await page.evaluate((plan) => {
    sessionStorage.setItem('__plan', JSON.stringify(plan));
    sessionStorage.removeItem('__ev');
  }, plan);
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return pieces;
}

/** The progress line, collected from the moment the run starts, so a message that shows for a second is not missed. */
async function watchProgress(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = ((window as unknown as { __seen: string[] }).__seen = []);
    const el = document.querySelector('#progress-text')!;
    const note = () => seen.push(el.textContent ?? '');
    new MutationObserver(note).observe(el, { childList: true, characterData: true, subtree: true });
  });
}
const progressSeen = (page: Page) => page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);

const cues = (srt: string) => srt.trim().split(/\n\s*\n/);

/** What the result boxes hold: each file's name and note, then its text. */
async function resultText(page: Page) {
  const list = page.locator('#results-list');
  const boxes = await list.locator('textarea').evaluateAll((all) => all.map((a) => (a as HTMLTextAreaElement).value));
  return `${await list.innerText()}\n${boxes.join('\n')}`;
}

test.describe('speech resumes from the last finished piece', () => {
  test('Video to subtitles: a worker lost after piece 1 is replaced, and only that piece is asked twice', async ({ page }) => {
    test.setTimeout(240_000);
    await recordEvents(page);
    await fakeSpeechWorker(page, ['ok']);
    await open(page, '/video-to-subtitles');
    const file = sound();
    const pieces = await countPieces(page, file, ['ok', 'die', 'ok']);
    await watchProgress(page);
    await page.locator('#file-input').setInputFiles(file);
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    expect(await spawned(page)).toBe(2);
    expect(await asked(page)).toBe(pieces + 1);
    expect((await progressSeen(page)).some((m) => /Picking up again from \d+:\d\d/.test(m))).toBe(true);
    const text = await resultText(page);
    // One cue per piece, in order, none twice.
    const found = [...text.matchAll(/Piece (\d+)\./g)].map((m) => Number(m[1]));
    expect(found).toEqual(Array.from({ length: pieces }, (_, i) => i + 1));
    const ok = (await runs(page)).filter((r) => r.outcome === 'ok');
    expect(ok).toHaveLength(1);
    expect((await runs(page)).filter((r) => r.outcome !== 'ok')).toHaveLength(0);
    for (const e of await events(page)) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
  });

  for (const path of ['/tools/add-subtitles-to-video', '/auto-caption-video']) {
    test(`${path}: the same resume, and an MP4 comes out`, async ({ page }, info: TestInfo) => {
      test.skip(info.project.name === 'webkit', 'the long video is made with the browser encoders, which Linux WebKit lacks');
      test.setTimeout(360_000);
      await recordEvents(page);
      await fakeSpeechWorker(page, ['ok']);
      await open(page, path);
      const video = await makeVideo(page, 80);
      const pieces = await countPieces(page, video, ['ok', 'die', 'ok']);
      await watchProgress(page);
      await page.locator('#file-input').setInputFiles(video);
      await page.locator('#run').click();
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 300_000 });
      await expect(page.locator('#error')).not.toHaveClass(/is-active/);
      expect(await spawned(page)).toBe(2);
      expect(await asked(page)).toBe(pieces + 1);
      expect((await progressSeen(page)).some((m) => /Picking up again from \d+:\d\d/.test(m))).toBe(true);
      await expect(page.locator('#results-list')).toContainText('.mp4');
      expect((await runs(page)).filter((r) => r.outcome !== 'ok')).toHaveLength(0);
    });
  }
});

test.describe('a run that still fails keeps what it finished', () => {
  test('a recording that kills the worker on the same piece fails fast, with the finished cue as a partial transcript', async ({ page }) => {
    test.setTimeout(240_000);
    await recordEvents(page);
    await fakeSpeechWorker(page, ['ok']);
    await open(page, '/video-to-subtitles');
    const file = sound();
    await countPieces(page, file, ['ok', 'die', 'die', 'die']);
    await page.locator('#file-input').setInputFiles(file);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
    await expect.poll(async () => (await runs(page)).filter((r) => r.outcome === 'error').length).toBe(1);
    const failed = (await runs(page)).find((r) => r.outcome === 'error')!;
    expect(['WorkerCrashError', 'OutOfMemoryError']).toContain(failed.error_class);
    expect(await spawned(page)).toBeLessThanOrEqual(3);
    await expect(page.locator('#results-list')).toContainText('Partial: speech up to');
    await expect(page.locator('#results-list')).toContainText('partial.srt');
    const text = await resultText(page);
    expect(text).toMatch(/Piece 1\./);
    expect(text).not.toMatch(/Piece 2\./);
    // Exactly the finished cue, as an SRT.
    const srt = await page.locator('#results-list textarea').inputValue();
    expect(cues(srt)).toHaveLength(1);
    expect(srt).toMatch(/^1\n\d\d:\d\d:\d\d,\d{3} --> /);
    for (const e of await events(page)) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
  });

  test('a failure on the first piece behaves as before: one start-up retry, then the error, nothing partial', async ({ page }) => {
    test.setTimeout(240_000);
    await recordEvents(page);
    await fakeSpeechWorker(page, ['die', 'die']);
    await open(page, '/video-to-subtitles');
    await page.locator('#file-input').setInputFiles(sound());
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
    expect(await spawned(page)).toBe(2);
    expect(await asked(page)).toBe(2);
    await expect.poll(async () => (await runs(page)).length).toBe(1);
    expect((await runs(page))[0]).toMatchObject({ outcome: 'error', error_class: 'WorkerCrashError' });
    await expect(page.locator('#results-list')).not.toContainText('Partial');
  });
});

test('Transcribe: a hidden page after piece 1 waits for the page to come back and does not ask earlier pieces again', async ({ page }) => {
  test.setTimeout(240_000);
  await recordEvents(page);
  await fakeSpeechWorker(page, ['ok']);
  await open(page, '/tools/transcribe');
  const file = sound();
  const pieces = await countPieces(page, file, ['ok', 'hidden', 'ok']);
  await page.evaluate(() => ((window as unknown as Win).__hidden = false));
  await watchProgress(page);
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#run').click();
  // The fake hides the page on the second request; the run waits.
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__hidden)).toBe(true);
  await page.waitForTimeout(2000);
  await expect(page.locator('#results')).not.toHaveClass(/is-active/);
  await page.evaluate(() => {
    (window as unknown as Win).__hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  expect(await asked(page)).toBe(pieces + 1);
  expect((await progressSeen(page)).some((m) => /Picking up again from \d+:\d\d/.test(m))).toBe(true);
  expect((await runs(page)).filter((r) => r.outcome !== 'ok')).toHaveLength(0);
  for (const e of await events(page)) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
});

/** The piece loop with a fake recogniser: pieces 1..4 of 10 s each, a stand-in for the worker. */
function unitDeps(throwAt: number[], out: { calls: number[]; progress: string[] }): PieceDeps {
  const failed = new Set<number>();
  return {
    recognise: async (piece) => {
      const k = Math.round(piece[0]!);
      out.calls.push(k);
      if (throwAt.includes(k) && !failed.has(k)) {
        failed.add(k);
        throw Object.assign(new Error('worker gone'), { name: 'WorkerCrashError' });
      }
      return { chunks: [{ start: 0, end: 5, text: `piece ${k}` }], language: 'en' };
    },
    release: () => {},
    pause: async () => {},
    page: { wasHidden: () => false, whenVisible: async () => {}, forgetHidden: () => {} },
    stepDown: () => false,
    time: (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`,
    onProgress: (m) => out.progress.push(m),
    onLoading: () => {},
    onPiece: () => {},
    onResume: () => {},
  };
}

/** Four 10 s pieces at 10 samples a second; the first sample of piece k holds k so the fake can tell them apart. */
function pieces4() {
  const rate = 10;
  const samples = new Float32Array(4 * 10 * rate);
  for (let k = 1; k <= 4; k++) samples[(k - 1) * 10 * rate] = k;
  return { samples, cuts: [0, 100, 200, 300, 400], rate };
}

test('unit: a recogniser that throws once at piece k gives the segments of the run that never threw', async () => {
  const { samples, cuts, rate } = pieces4();
  const clean = { calls: [] as number[], progress: [] as string[] };
  const base = await recognisePieces(samples, cuts, rate, 'a.wav', { language: null, task: 'transcribe', model: 'whisper-base' }, unitDeps([], clean));
  for (const k of [2, 3, 4]) {
    const out = { calls: [] as number[], progress: [] as string[] };
    const run = await recognisePieces(samples, cuts, rate, 'a.wav', { language: null, task: 'transcribe', model: 'whisper-base' }, unitDeps([k], out));
    expect(run.segments).toEqual(base.segments);
    // Only the failed piece is asked twice.
    expect(out.calls).toEqual([1, 2, 3, 4].flatMap((p) => (p === k ? [p, p] : [p])));
    expect(out.progress.some((m) => m.startsWith('Picking up again from'))).toBe(true);
  }
  expect(base.segments.map((s: Segment) => s.text)).toEqual(['piece 1', 'piece 2', 'piece 3', 'piece 4']);
});

test('unit: at most two resumes, each after a finished piece; the error carries the pieces finished', async () => {
  const { samples, cuts, rate } = pieces4();
  // Pieces 2 and 3 each fail once (two resumes, allowed); piece 4 then fails on every try (fails fast after its first resume attempt cannot be spent).
  const out = { calls: [] as number[], progress: [] as string[] };
  const deps = unitDeps([2, 3], out);
  const run = await recognisePieces(samples, cuts, rate, 'a.wav', { language: null, task: 'transcribe', model: 'whisper-base' }, deps);
  expect(run.segments).toHaveLength(4);
  // The same piece failing straight after a resume is final.
  const stuck = { calls: [] as number[], progress: [] as string[] };
  const always = unitDeps([], stuck);
  always.recognise = async (piece) => {
    const k = Math.round(piece[0]!);
    stuck.calls.push(k);
    if (k >= 2) throw Object.assign(new Error('worker gone'), { name: 'WorkerCrashError' });
    return { chunks: [{ start: 0, end: 5, text: `piece ${k}` }], language: 'en' };
  };
  const err = await recognisePieces(samples, cuts, rate, 'a.wav', { language: null, task: 'transcribe', model: 'whisper-base' }, always).catch((e) => e);
  expect(err.name).toBe('WorkerCrashError');
  expect(stuck.calls).toEqual([1, 2, 2]);
  expect(err.partial.segments.map((s: Segment) => s.text)).toEqual(['piece 1']);
  expect(err.partial.upTo).toBe(10);
  expect(err.partial.total).toBe(40);
});

test('unit: a memory death after piece 1 that steps down resumes on the smaller model, and the run says so', async () => {
  const { samples, cuts, rate } = pieces4();
  const out = { calls: [] as number[], progress: [] as string[] };
  const models: string[] = [];
  const deps = unitDeps([3], out);
  const ask = deps.recognise;
  deps.recognise = (piece, language, model, onLoading) => (models.push(model), ask(piece, language, model, onLoading));
  deps.stepDown = (_err, model) => model === 'whisper-base';
  const run = await recognisePieces(samples, cuts, rate, 'a.wav', { language: null, task: 'transcribe', model: 'whisper-base' }, deps);
  expect(models).toEqual(['whisper-base', 'whisper-base', 'whisper-base', 'whisper-tiny', 'whisper-tiny']);
  expect(run.steppedDown).toBe(true);
  expect(run.model).toBe('whisper-tiny');
});
