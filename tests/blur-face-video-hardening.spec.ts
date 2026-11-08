// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Blur faces in video, hardened: odd and large clips end in a finished video or a named, plain error, a lost model file or a
// failed engine start is tried again, and a clip with no faces keeps saying so. Clips are made with ffmpeg by
// tests/make-blur-face-video-fixtures.sh (nothing is committed). BFV_FIXTURES=<dir> reuses a folder already made;
// BFV_REPORT=<file> appends one JSON line per clip (class, note, seconds) for a before/after table.
const dir = process.env.BFV_FIXTURES ?? join(mkdtempSync(join(tmpdir(), 'bfv-')), 'fx');
const script = fileURLToPath(new URL('./make-blur-face-video-fixtures.sh', import.meta.url));
const clip = (name: string) => join(dir, name);
const report = (row: Record<string, unknown>) => process.env.BFV_REPORT && appendFileSync(process.env.BFV_REPORT, JSON.stringify(row) + '\n');

test.beforeAll(() => {
  if (!existsSync(clip('plain.mp4'))) execFileSync('bash', [script, dir], { stdio: 'ignore' });
});

// Linux WebKit in CI stalls when it decodes and re-encodes video in the page; those runs are checked on a Mac and in Chromium.
const needsEncode = (browserName: string) => test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux WebKit in CI stalls on video re-encode');

type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

async function open(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

async function start(page: Page, file: string) {
  await page.goto('/tools/blur-face-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#run').click();
}

/** Run a clip to its end and return what the page showed: the outcome class from the run record, the note, the error text. */
async function finish(page: Page, name: string) {
  const began = Date.now();
  await expect(page.locator('#results, #error').and(page.locator('.is-active'))).toBeVisible({ timeout: 200_000 });
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length, { timeout: 15_000 }).toBe(1);
  const d = (await events(page)).find((e) => e.n === 'tool_run')!.d;
  const ok = d.outcome === 'ok';
  const text = (await page.locator(ok ? '#results-list' : '#error').innerText()).replace(/\s+/g, ' ');
  const row = { clip: name, browser: page.context().browser()?.browserType().name(), outcome: d.outcome, error_class: d.error_class ?? '-', seconds: Math.round((Date.now() - began) / 1000), text: text.slice(0, 300) };
  report(row);
  return { d, text };
}

test.describe('clips from ffmpeg', () => {
  test('a plain clip finishes and says how many frames were covered', async ({ page, browserName }) => {
    needsEncode(browserName);
    test.setTimeout(240_000);
    await open(page);
    await start(page, clip('plain.mp4'));
    const { d, text } = await finish(page, 'plain.mp4');
    expect(d.outcome).toBe('ok');
    expect(text).toMatch(/faces covered in \d+% of frames/);
  });

  test('a 4K 60 fps clip finishes with its faces covered', async ({ page, browserName }) => {
    needsEncode(browserName);
    test.setTimeout(420_000);
    await open(page);
    await start(page, clip('uhd60.mp4'));
    const { d, text } = await finish(page, 'uhd60.mp4');
    expect(d.outcome, text).toBe('ok');
    expect(text).toMatch(/faces covered in \d+% of frames/);
  });

  test('a portrait phone clip with rotation metadata keeps its upright size', async ({ page, browserName }) => {
    needsEncode(browserName);
    test.setTimeout(240_000);
    await open(page);
    await start(page, clip('portrait-rotated.mp4'));
    const { d, text } = await finish(page, 'portrait-rotated.mp4');
    expect(d.outcome, text).toBe('ok');
    expect(text).toMatch(/1080×1920/);
    expect(text).toMatch(/faces covered/);
  });

  test('a clip with no faces keeps its outcome: it finishes and says no faces were found', async ({ page, browserName }) => {
    needsEncode(browserName);
    test.setTimeout(240_000);
    await open(page);
    await start(page, clip('no-faces.mp4'));
    const { d, text } = await finish(page, 'no-faces.mp4');
    expect(d.outcome).toBe('ok');
    expect(text).toContain('no faces found: check the video before sharing it');
  });

  for (const name of ['hevc.mp4', 'vp9.webm', 'av1.mp4']) {
    test(`${name}: finishes, or is refused up front as UnsupportedCodec`, async ({ page, browserName }) => {
      needsEncode(browserName);
      test.skip(!existsSync(clip(name)), 'this ffmpeg has no encoder for it');
      test.setTimeout(240_000);
      await open(page);
      await start(page, clip(name));
      const { d, text } = await finish(page, name);
      if (d.outcome === 'ok') expect(text).toMatch(/faces covered/);
      else expect(d.error_class, text).toBe('UnsupportedCodec');
    });
  }

  test('a truncated MP4 ends in a named error, never a bare one', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    await start(page, clip('truncated.mp4'));
    const { d, text } = await finish(page, 'truncated.mp4');
    if (d.outcome === 'error') {
      expect(['Error', 'TypeError', 'RangeError', '-', 'BlurFaceVideoUnnamedError']).not.toContain(d.error_class);
    }
  });

  test('a file that is not a video, renamed .mp4, is refused as UnreadableContainer', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    await start(page, clip('not-a-video.mp4'));
    const { d, text } = await finish(page, 'not-a-video.mp4');
    expect(d.outcome).toBe('error');
    expect(d.error_class, text).toBe('UnreadableContainer');
  });
});

test.describe('the face finder', () => {
  test('the model file cannot be fetched: ModelDownloadFailed with a plain message', async ({ page, browserName }) => {
    needsEncode(browserName);
    test.setTimeout(240_000);
    await open(page);
    await page.route('**/models/blaze_face_short_range.tflite', (route) => route.abort());
    await start(page, clip('plain.mp4'));
    const { d, text } = await finish(page, 'plain.mp4 + model download blocked');
    expect(d.outcome).toBe('error');
    expect(d.error_class).toBe('ModelDownloadFailed');
  });

  test('the model file drops once, then arrives: the run finishes', async ({ page, browserName }) => {
    needsEncode(browserName);
    test.setTimeout(240_000);
    await open(page);
    let dropped = 0;
    await page.route('**/models/blaze_face_short_range.tflite', (route) => (dropped++ < 1 ? route.abort() : route.continue()));
    await start(page, clip('plain.mp4'));
    const { d, text } = await finish(page, 'plain.mp4 + model download dropped once');
    expect(d.outcome, text).toBe('ok');
    expect(dropped).toBeGreaterThan(0);
  });

  test('the engine fails to start once (its wasm file is refused), then starts: the run finishes', async ({ page, browserName }) => {
    needsEncode(browserName);
    test.setTimeout(240_000);
    await open(page);
    let refused = 0;
    await page.route('**/vendor/mediapipe*/**/*.wasm', (route) => (refused++ < 1 ? route.abort() : route.continue()));
    await start(page, clip('plain.mp4'));
    const { d, text } = await finish(page, 'plain.mp4 + engine start failed once');
    expect(d.outcome, text).toBe('ok');
    expect(refused).toBeGreaterThan(0);
  });

  test('the engine fails to start every time: the failure is named for the face finder, not a bare error', async ({ page, browserName }) => {
    needsEncode(browserName);
    test.setTimeout(240_000);
    await open(page);
    await page.route('**/vendor/mediapipe*/**/*.wasm', (route) => route.abort());
    await start(page, clip('plain.mp4'));
    const { d, text } = await finish(page, 'plain.mp4 + engine start failed always');
    expect(d.outcome).toBe('error');
    expect(['Error', 'TypeError', '-']).not.toContain(d.error_class);
  });
});

test.describe('a long clip', () => {
  test('an 11-minute 1080p clip starts and keeps moving', async ({ page }) => {
    test.skip(!process.env.BFV_LONG, 'BFV_LONG=1: needs the 11-minute clip and several minutes');
    test.setTimeout(300_000);
    await open(page);
    await start(page, clip('long1080.mp4'));
    const progress = page.locator('#progress-text');
    await expect(progress).toContainText(/Hiding faces in .*: [1-9]\d*%/, { timeout: 240_000 });
    report({ clip: 'long1080.mp4', browser: page.context().browser()?.browserType().name(), progress: (await progress.innerText()).replace(/^.*: /, '') });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  });
});
