// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { piano, silentWav8, wav } from './music-synth';

/**
 * MP3 to MIDI against real edge-case files and forced failures. Every file is made here (ffmpeg or a few lines of JS) at
 * test time; nothing large is committed. Each case either finishes with a MIDI file or ends with a named class and a message.
 * M2M_RECORD=<file> appends one JSON line per run (case, state, class), so the same spec can be run on main and on a branch
 * for a before/after table; the assertions are the branch's.
 */
// beforeAll runs once per worker, so each worker writes its own folder (a file rewritten under a reader is a NotReadable run).
const dir = join(process.env.M2M_FIXTURES ?? join(tmpdir(), 'stayput-mp3-to-midi-fixtures'), `w${process.env.TEST_WORKER_INDEX ?? '0'}`);
const fx = (name: string) => join(dir, name);
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const ff = (...args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' });
const tone = (seconds: number, rate: number, hz = 440) => ['-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${seconds}:sample_rate=${rate}`];

test.beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  const tune = piano();
  writeFileSync(fx('tune.wav'), wav(tune, 22050));
  // 14 s, so the tempo finder (10 s and up) runs too.
  const long = new Float32Array(tune.length * 2);
  long.set(tune);
  long.set(tune, tune.length);
  writeFileSync(fx('tune-14s.wav'), wav(long, 22050));
  writeFileSync(fx('empty.mp3'), Buffer.alloc(0));
  writeFileSync(fx('not-audio.mp3'), Buffer.from('This is a text note, not a recording. '.repeat(200)));
  writeFileSync(fx('silent.wav'), silentWav8(3, 8000));

  // Damaged: an MP3 and a WAV cut off part-way (the WAV header still promises the whole length).
  ff('-i', fx('tune.wav'), '-c:a', 'libmp3lame', '-b:a', '128k', fx('tune.mp3'));
  const mp3 = readFileSync(fx('tune.mp3'));
  writeFileSync(fx('truncated.mp3'), mp3.subarray(0, Math.floor(mp3.length * 0.6)));
  const w = wav(tune, 22050);
  writeFileSync(fx('truncated.wav'), w.subarray(0, Math.floor(w.length * 0.6)));

  // Rates and channel layouts.
  ff('-i', fx('tune.wav'), '-ar', '8000', fx('rate-8k.wav'));
  ff('-i', fx('tune.wav'), '-ar', '96000', fx('rate-96k.wav'));
  ff('-i', fx('tune.wav'), '-ac', '2', fx('stereo.wav'));
  ff('-i', fx('tune.wav'), '-af', 'pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0', fx('surround-5.1.wav'));

  // Lengths: just under half a second, exactly half a second, exactly five minutes, just over.
  ff(...tone(0.49, 22050), fx('len-0.49s.wav'));
  ff(...tone(0.5, 22050), fx('len-0.5s.wav'));
  ff(...tone(300, 8000), '-ac', '1', fx('len-300s.wav'));
  ff(...tone(310, 8000), '-ac', '1', fx('len-310s.wav'));

  // What phones and other apps produce.
  ff('-i', fx('tune.wav'), '-c:a', 'aac', fx('phone.m4a'));
  ff('-i', fx('tune.wav'), '-c:a', 'alac', fx('alac.m4a'));
  ff('-i', fx('tune.wav'), '-c:a', 'libopus', fx('opus.webm'));
  ff('-i', fx('tune.wav'), '-c:a', 'pcm_s16be', fx('tune.aiff'));
  ff('-f', 'lavfi', '-i', 'color=c=black:s=160x120:d=8:r=15', '-i', fx('tune.wav'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-f', 'mov', fx('phone-video.mov'));
  ff('-f', 'lavfi', '-i', 'color=c=black:s=160x120:d=4:r=15', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', fx('no-sound.mp4'));
});

interface Outcome {
  state: 'ok' | 'error' | 'blocked';
  cls?: string;
  message: string;
}

type Ev = { n: string; d: Record<string, string> };
type Hooks = {
  /** Make the first `times` note workers die at start-up with `message` (or never answer, if `hang`). */
  breakWorker?: { match: 'basic-pitch.worker' | 'bpm-key.worker'; times: number; message?: string; hang?: boolean };
};

async function open(page: Page, hooks: Hooks = {}) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  if (hooks.breakWorker) {
    await page.addInitScript((b) => {
      const Real = window.Worker;
      let made = 0;
      // The worker is built from a blob that throws (an error event on the page) or never answers.
      window.Worker = function (url: string | URL, opts?: WorkerOptions) {
        if (String(url).includes(b.match) && made++ < b.times) {
          const code = b.hang ? '' : `throw new Error(${JSON.stringify(b.message ?? 'The worker broke')});`;
          return new Real(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), opts);
        }
        return new Real(url, opts);
      } as unknown as typeof Worker;
    }, hooks.breakWorker);
  }
  await page.goto('/tools/mp3-to-midi');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

const events = (page: Page): Promise<Ev[]> => page.evaluate(() => (window as unknown as { __events: Ev[] }).__events);

/** Drop the file in, press Run when it can be pressed, and wait for the MIDI file or the error. */
async function runFile(page: Page, file: string, label: string): Promise<Outcome> {
  await page.setInputFiles('#file-input', file);
  // The drop-time checks (length, no sound) run in the background; give them a moment to switch Run off.
  await page.waitForTimeout(2500);
  let out: Outcome;
  if (await page.locator('#run').isDisabled()) {
    out = { state: 'blocked', message: (await page.locator('#run-hint').textContent()) ?? '' };
  } else {
    await page.locator('#run').click();
    const done = page.locator('#results-list .result-item, #error:visible');
    await expect(done.first()).toBeVisible({ timeout: 85_000 });
    const run = (await events(page)).filter((e) => e.n === 'tool_run').pop();
    out = (await page.locator('#error').isVisible())
      ? { state: 'error', cls: run?.d.error_class, message: (await page.locator('#error').textContent()) ?? '' }
      : { state: 'ok', message: (await page.locator('#results-list').textContent()) ?? '' };
  }
  if (process.env.M2M_RECORD) appendFileSync(process.env.M2M_RECORD, JSON.stringify({ case: label, state: out.state, cls: out.cls ?? null }) + '\n');
  return out;
}

/** The run finished with a MIDI file. */
function finishes(o: Outcome) {
  expect(o.state, `${o.cls ?? ''} ${o.message}`).toBe('ok');
  expect(o.message).toContain('notes');
}

/** The run ended early or failed with a class that says why, and a sentence for the visitor. */
function named(o: Outcome, classes: string[]) {
  expect(o.state).not.toBe('ok');
  if (o.state === 'error') expect(classes, o.message).toContain(o.cls);
  expect(o.message.trim().length).toBeGreaterThan(20);
}

const supports = (page: Page, codec: string) =>
  page.evaluate(async (c) => typeof AudioDecoder !== 'undefined' && (await AudioDecoder.isConfigSupported({ codec: c, sampleRate: 44100, numberOfChannels: 2 })).supported === true, codec);

/** Sound the browser (or the page's fallbacks) may or may not read: it finishes, or is refused with a decode class. */
const DECODE_CLASSES = ['AudioDecodeError', 'NoSoundTrack', 'UnsupportedSound', 'AudioDamaged', 'NotAnAudioFile', 'UnsupportedAudioCodec'];

test.describe('files the browser may refuse', () => {
  test('a plain WAV finishes (baseline)', async ({ page }) => {
    await open(page);
    finishes(await runFile(page, fx('tune.wav'), 'tune.wav'));
  });

  test('an empty file is refused at drop time by the shared file handler, with no run recorded', async ({ page }) => {
    await open(page);
    const o = await runFile(page, fx('empty.mp3'), 'empty');
    expect(o.state).toBe('blocked');
    await expect(page.locator('#tool')).toContainText('empty (0 bytes)');
    expect((await events(page)).filter((e) => e.n === 'tool_run')).toEqual([]);
  });

  test('a text file renamed .mp3 is refused as not audio', async ({ page }) => {
    await open(page);
    named(await runFile(page, fx('not-audio.mp3'), 'renamed-text'), DECODE_CLASSES);
  });

  test('a video with no sound track is refused at drop time with its own class', async ({ page }) => {
    await open(page);
    const seen: string[] = [];
    page.on('request', (r) => seen.push(r.url()));
    const o = await runFile(page, fx('no-sound.mp4'), 'video-no-sound');
    expect(o.state).toBe('blocked');
    expect(seen.some((u) => u.includes('/models/'))).toBe(false);
    // Forced past the drop check, the run itself ends as NoSoundTrack.
    await page.evaluate(() => ((document.getElementById('run') as HTMLButtonElement).disabled = false));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toBeVisible({ timeout: 30_000 });
    const run = (await events(page)).filter((e) => e.n === 'tool_run').pop();
    expect(run?.d.error_class).toBe('NoSoundTrack');
  });

  test('a silent file ends as SilentFile, not UnreadableFile, before the model is fetched', async ({ page }) => {
    await open(page);
    const seen: string[] = [];
    page.on('request', (r) => seen.push(r.url()));
    const o = await runFile(page, fx('silent.wav'), 'silent');
    expect(o.state).toBe('error');
    expect(o.cls).toBe('SilentFile');
    expect(o.message).toContain('silent');
    expect(seen.some((u) => u.includes('/models/'))).toBe(false);
  });

  test('an MP3 cut off part-way finishes with the notes it has, or is named damaged', async ({ page }) => {
    await open(page);
    const o = await runFile(page, fx('truncated.mp3'), 'truncated-mp3');
    if (o.state === 'ok') finishes(o);
    else named(o, DECODE_CLASSES);
  });

  test('a WAV whose header promises more than the file holds finishes or is named damaged', async ({ page }) => {
    await open(page);
    const o = await runFile(page, fx('truncated.wav'), 'truncated-wav');
    if (o.state === 'ok') finishes(o);
    else named(o, DECODE_CLASSES);
  });

  test('AAC from a phone (.m4a and .mov with a picture) finishes where the browser can read AAC, else is named', async ({ page }) => {
    await open(page);
    const aac = await supports(page, 'mp4a.40.2');
    for (const [name, label] of [['phone.m4a', 'm4a-aac'], ['phone-video.mov', 'mov-aac']] as const) {
      await page.reload();
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      const o = await runFile(page, fx(name), label);
      if (aac || o.state === 'ok') finishes(o);
      else named(o, DECODE_CLASSES);
    }
  });

  test('ALAC in .m4a finishes where it can be decoded, else is named', async ({ page }) => {
    await open(page);
    const o = await runFile(page, fx('alac.m4a'), 'alac');
    if (o.state === 'ok') finishes(o);
    else named(o, DECODE_CLASSES);
  });

  test('Opus in WebM finishes where it can be decoded (Safari may not), else is named', async ({ page }) => {
    await open(page);
    const o = await runFile(page, fx('opus.webm'), 'opus-webm');
    if (o.state === 'ok') finishes(o);
    else named(o, DECODE_CLASSES);
  });

  test('AIFF finishes in every browser (the page reads it itself where the browser cannot)', async ({ page }) => {
    await open(page);
    finishes(await runFile(page, fx('tune.aiff'), 'aiff'));
  });

  test('AMR in 3GP finishes where it can be decoded, else is named', async ({ page }) => {
    await open(page);
    const o = await runFile(page, here('./fixtures/static/mpeg4-amrnb.3gp'), '3gp-amr');
    if (o.state === 'ok') finishes(o);
    else named(o, [...DECODE_CLASSES, 'NoNotesFound', 'SilentFile']);
  });
});

test.describe('rates, channels and lengths', () => {
  for (const [name, label] of [['rate-8k.wav', '8 kHz'], ['rate-96k.wav', '96 kHz'], ['stereo.wav', 'stereo'], ['surround-5.1.wav', '5.1']] as const) {
    test(`${label} finishes`, async ({ page }) => {
      await open(page);
      finishes(await runFile(page, fx(name), label));
    });
  }

  test('a clip under half a second ends as ClipTooShort, before the model is fetched', async ({ page }) => {
    await open(page);
    const seen: string[] = [];
    page.on('request', (r) => seen.push(r.url()));
    const o = await runFile(page, fx('len-0.49s.wav'), '0.49s');
    expect(o.cls).toBe('ClipTooShort');
    expect(seen.some((u) => u.includes('/models/'))).toBe(false);
  });

  test('a clip of exactly half a second is not too short', async ({ page }) => {
    await open(page);
    const o = await runFile(page, fx('len-0.5s.wav'), '0.5s');
    if (o.state === 'error') expect(o.cls).toBe('NoNotesFound');
    else finishes(o);
  });

  test('a five-minute file is read; one just over five minutes is refused at drop time', async ({ page }) => {
    await open(page);
    const ok = await runFile(page, fx('len-300s.wav'), '300s');
    if (ok.state === 'error') expect(ok.cls).toBe('NoNotesFound');
    else finishes(ok);
    await page.reload();
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    const over = await runFile(page, fx('len-310s.wav'), '310s');
    expect(over.state).toBe('blocked');
    expect(over.message).toContain('just over 5 minutes');
  });
});

test.describe('the model, the engine and the worker', () => {
  test('a model download that drops once finishes on a fresh worker', async ({ page }) => {
    let n = 0;
    await page.route('**/models/nmp.onnx', (route) => (n++ === 0 ? route.abort('connectionreset') : route.continue()));
    await open(page);
    finishes(await runFile(page, fx('tune.wav'), 'model-drops-once'));
    expect(n).toBeGreaterThanOrEqual(2);
  });

  test('a blocked model download ends as ModelDownloadError after the retry', async ({ page }) => {
    let n = 0;
    await page.route('**/models/nmp.onnx', (route) => (n++, route.abort('blockedbyclient')));
    await open(page);
    const o = await runFile(page, fx('tune.wav'), 'model-blocked');
    expect(o.cls).toBe('ModelDownloadError');
    expect(o.message).toContain('could not be downloaded');
    expect(n).toBe(2);
  });

  test('offline with no model on the device ends as ModelOffline and does not retry', async ({ page, context }) => {
    let n = 0;
    // The connection goes the moment the model is asked for, as when a phone leaves Wi-Fi.
    await page.route('**/models/nmp.onnx', async (route) => {
      n++;
      await context.setOffline(true);
      await route.abort('internetdisconnected');
    });
    await open(page);
    const o = await runFile(page, fx('tune.wav'), 'model-offline');
    await context.setOffline(false);
    expect(o.cls).toBe('ModelOffline');
    expect(n).toBe(1);
  });

  test('an engine file that fails once finishes on a fresh worker', async ({ page }) => {
    let n = 0;
    await page.route(/\/vendor\/onnxruntime-web[^/]*\/.*\.wasm/, (route) => (n++ === 0 ? route.abort('connectionreset') : route.continue()));
    await open(page);
    finishes(await runFile(page, fx('tune.wav'), 'engine-drops-once'));
    expect(n).toBeGreaterThanOrEqual(2);
  });

  test('an engine that never loads ends as a named class', async ({ page }) => {
    await page.route(/\/vendor\/onnxruntime-web[^/]*\/.*\.wasm/, (route) => route.abort('blockedbyclient'));
    await open(page);
    const o = await runFile(page, fx('tune.wav'), 'engine-blocked');
    named(o, ['NoteEngineFailed', 'ModelDownloadError', 'ModelOffline']);
  });

  test('a model file that will not start a session ends as NoteEngineFailed after a fresh worker', async ({ page }) => {
    let n = 0;
    // Right size, wrong bytes: the download is complete and the engine cannot read it.
    await page.route('**/models/nmp.onnx', (route) => (n++, route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.alloc(230_444, 7) })));
    await open(page);
    const o = await runFile(page, fx('tune.wav'), 'session-fails');
    expect(o.cls).toBe('NoteEngineFailed');
    expect(n).toBe(2);
  });

  test('a note worker that dies once is replaced and the run finishes', async ({ page }) => {
    await open(page, { breakWorker: { match: 'basic-pitch.worker', times: 1 } });
    finishes(await runFile(page, fx('tune.wav'), 'worker-dies-once'));
  });

  test('a note worker that keeps dying ends as Mp3ToMidiFailed', async ({ page }) => {
    await open(page, { breakWorker: { match: 'basic-pitch.worker', times: 2 } });
    const o = await runFile(page, fx('tune.wav'), 'worker-dies-twice');
    expect(o.cls).toBe('Mp3ToMidiFailed');
  });

  test('a note worker that dies for want of memory is named OutOfMemoryError', async ({ page }) => {
    await open(page, { breakWorker: { match: 'basic-pitch.worker', times: 2, message: 'Out of memory' } });
    const o = await runFile(page, fx('tune.wav'), 'worker-oom');
    expect(o.cls).toBe('OutOfMemoryError');
  });
});

test.describe('the tempo finder', () => {
  test('a tempo worker that dies does not fail a run that found notes', async ({ page }) => {
    await open(page, { breakWorker: { match: 'bpm-key.worker', times: 1 } });
    const o = await runFile(page, fx('tune-14s.wav'), 'bpm-worker-dies');
    finishes(o);
    await expect(page.locator('#mm-tempo')).toContainText('120 BPM, a default');
  });

  test('a tempo worker that never answers does not hold the notes back', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, { breakWorker: { match: 'bpm-key.worker', times: 1, hang: true } });
    const o = await runFile(page, fx('tune-14s.wav'), 'bpm-worker-hangs');
    finishes(o);
    await expect(page.locator('#mm-tempo')).toContainText('120 BPM, a default');
  });
});
