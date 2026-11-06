// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { bigPng } from './edge-cases-files';

/**
 * remove-background against real edge-case pictures (made by tests/fixtures/make-bg-edge-cases.py, plus the shared
 * edge-case corpus). Each ends one of two ways: a result (outcome ok), or a named class that says the real cause.
 * Set BG_REPORT=1 to print "RESULT <fixture> <outcome> <class>" for every file instead of asserting (how the
 * before/after table in the pull request was made).
 */
const bg = (n: string) => fileURLToPath(new URL(`./fixtures/bg-edge/${n}`, import.meta.url));
const edge = (n: string) => fileURLToPath(new URL(`./fixtures/edge-cases/${n}`, import.meta.url));
const stat = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));
const REPORT = !!process.env.BG_REPORT;

type Ev = { n: string; d: Record<string, string> };
async function stubAnalytics(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}
const toolRuns = (page: Page) => page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as Ev[]).filter((e) => e.n === 'tool_run').map((e) => e.d));

interface Outcome {
  /** ok, or the class a failed run recorded, or "refused-on-add" (no run started). */
  label: string;
  message: string;
}

/** Open the tool, add the file, press Run, and wait for the one recorded run (or for the file to be refused on add). */
async function runOne(page: Page, file: string, opts: { format?: string; before?: () => Promise<void> } = {}): Promise<Outcome> {
  await stubAnalytics(page);
  await opts.before?.();
  await page.goto('/tools/remove-background');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  if (opts.format) await page.locator('#format').selectOption(opts.format);
  await page.locator('#file-input').setInputFiles(file);
  const run = page.locator('#run');
  if (!(await run.isEnabled().catch(() => false))) {
    await page.waitForTimeout(500);
    if (!(await run.isEnabled().catch(() => false))) {
      const text = (await page.locator('#error').innerText().catch(() => '')) || (await page.locator('#file-list').innerText().catch(() => ''));
      return { label: 'refused-on-add', message: text.trim().slice(0, 200) };
    }
  }
  await run.click();
  await expect.poll(async () => (await toolRuns(page)).length, { timeout: 200_000 }).toBeGreaterThanOrEqual(1);
  const runs = await toolRuns(page);
  expect(runs).toHaveLength(1);
  if (runs[0]!.outcome === 'ok') return { label: 'ok', message: '' };
  const message = (await page.locator('#error').innerText().catch(() => '')).trim().slice(0, 300);
  return { label: runs[0]!.error_class ?? `(${runs[0]!.outcome})`, message };
}

interface Case {
  name: string;
  file: () => string | Promise<string>;
  /** What the branch must end with: "ok" or a class name. A list when browsers differ (WebKit cannot open some of them). */
  want: string | string[];
  format?: string;
  /** The message must contain this (plain words for the cause). */
  says?: RegExp;
}

const CASES: Case[] = [
  { name: 'photo 12 MP', file: () => bg('photo-12mp.jpg'), want: 'ok' },
  { name: 'photo 48 MP', file: () => bg('photo-48mp.jpg'), want: 'ok' },
  { name: 'picture over the canvas limit (400 MP)', file: () => bigPng(20000, 20000, 'huge.png'), want: ['OutOfMemoryError', 'ok', 'InputError'], says: /too large|No subject/i },
  { name: 'truncated JPEG', file: () => bg('truncated-photo.jpg'), want: 'PictureDamaged', says: /damaged or cut off/ },
  { name: 'CMYK JPEG', file: () => edge('cmyk.jpg'), want: 'ok' },
  { name: 'progressive JPEG', file: () => bg('progressive-photo.jpg'), want: 'ok' },
  { name: '16-bit PNG', file: () => bg('rgb16.png'), want: 'ok' },
  { name: 'palette PNG', file: () => bg('palette.png'), want: 'ok' },
  { name: 'animated GIF', file: () => bg('animated.gif'), want: 'ok' },
  { name: 'animated WebP', file: () => bg('animated.webp'), want: 'ok' },
  { name: 'HEIC', file: () => edge('heic-still.heic'), want: 'ok' },
  { name: 'SVG', file: () => bg('subject.svg'), want: 'ok' },
  { name: 'JPEG renamed .png', file: () => bg('jpeg-named.png'), want: 'ok' },
  { name: 'zero-byte file', file: () => edge('zero.png'), want: 'refused-on-add' },
  { name: 'non-image renamed .jpg', file: () => bg('notes.jpg'), want: 'NotAPicture', says: /isn't a picture/ },
  { name: 'JPEG header followed by noise', file: () => edge('garbage.jpg'), want: 'PictureDamaged', says: /damaged or cut off/ },
  { name: 'text file renamed .png', file: () => edge('text-named.png'), want: 'NotAPicture', says: /isn't a picture/ },
  { name: 'photo with no subject', file: () => bg('no-subject.jpg'), want: 'InputError' },
];

for (const c of CASES) {
  test(`remove-background: ${c.name}`, async ({ page }) => {
    test.setTimeout(240_000);
    const got = await runOne(page, await c.file(), { format: c.format });
    if (REPORT) {
      console.log(`RESULT ${test.info().project.name} | ${c.name} | ${got.label} | ${got.message.replace(/\s+/g, ' ')}`);
      return;
    }
    expect(Array.isArray(c.want) ? c.want : [c.want]).toContain(got.label);
    if (got.label !== 'ok' && c.says) expect(got.message).toMatch(c.says);
  });
}

/** Simulated failures. Each is forced in the page, since a real Android GPU fault or a dropped connection cannot be repeated on demand. */
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** The model's answer to the first `fails` requests is a run failure; what each request asked for is kept in window.__asked. */
function failModelRuns(page: Page, fails: number) {
  return page.addInitScript((n) => {
    const w = window as unknown as { __asked: boolean[] };
    w.__asked = [];
    const real = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, data: unknown, ...rest: unknown[]) {
      const d = data as { id: number; type?: string; lean?: boolean } | undefined;
      if (d?.type === 'mask') {
        w.__asked.push(!!d.lean);
        if (w.__asked.length <= n) {
          setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: d.id, type: 'error', name: 'BackgroundModelRunFailed', message: 'simulated: the model could not run on this device' } })), 20);
          return;
        }
      }
      return (real as (...a: unknown[]) => void).call(this, data, ...rest);
    } as typeof Worker.prototype.postMessage;
  }, fails);
}

test('remove-background: a model run that fails once is retried in a fresh, lighter session and the run succeeds', async ({ page }) => {
  test.setTimeout(240_000);
  await failModelRuns(page, 1);
  const got = await runOne(page, bg('photo-12mp.jpg'));
  if (REPORT) return console.log(`RESULT ${test.info().project.name} | model run fails once | ${got.label}`);
  expect(got.label).toBe('ok');
  expect(await page.evaluate(() => (window as unknown as { __asked: boolean[] }).__asked)).toEqual([false, true]);
});

test('remove-background: a model that fails to run twice ends BackgroundModelRunFailed, as one failed run', async ({ page }) => {
  test.setTimeout(240_000);
  await failModelRuns(page, 2);
  const got = await runOne(page, bg('photo-12mp.jpg'));
  if (REPORT) return console.log(`RESULT ${test.info().project.name} | model run fails twice | ${got.label}`);
  expect(got.label).toBe('BackgroundModelRunFailed');
});

/** A browser whose canvas cannot write WebP (Safari's), whatever the engine, and a WebP encoder that is blocked for the first `blocked` fetches. */
async function noNativeWebp(page: Page, blocked: number) {
  await page.addInitScript(() => {
    const fix = (type: string) => (type === 'image/webp' ? 'image/png' : type);
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
      return toBlob.call(this, cb, fix(type ?? 'image/png'), q);
    };
    if (typeof OffscreenCanvas !== 'undefined') {
      const convert = OffscreenCanvas.prototype.convertToBlob;
      OffscreenCanvas.prototype.convertToBlob = function (o) {
        return convert.call(this, { ...o, type: fix(o?.type ?? 'image/png') });
      };
    }
  });
  let seen = 0;
  await page.route('**/vendor/jsquash-webp@*/**', (route) => (++seen <= blocked ? route.abort('connectionreset') : route.continue()));
}

test('remove-background: the WebP encoder that cannot be fetched ends EncoderLoadFailed (was ImageFailed), saying to choose PNG', async ({ page }) => {
  test.setTimeout(240_000);
  await noNativeWebp(page, 1000);
  const got = await runOne(page, bg('photo-12mp.jpg'), { format: 'image/webp' });
  if (REPORT) return console.log(`RESULT ${test.info().project.name} | WebP encoder blocked | ${got.label} | ${got.message}`);
  expect(got.label).toBe('EncoderLoadFailed');
  expect(got.message).toMatch(/choose PNG/);
});

test('remove-background: a WebP encoder that fails to load once is fetched again and the run succeeds', async ({ page }) => {
  test.setTimeout(240_000);
  await noNativeWebp(page, 1);
  const got = await runOne(page, bg('photo-12mp.jpg'), { format: 'image/webp' });
  if (REPORT) return console.log(`RESULT ${test.info().project.name} | WebP encoder fails once | ${got.label}`);
  expect(got.label).toBe('ok');
});

test.describe('on an iPhone, where one canvas holds 16.7 million pixels', () => {
  test.use({ userAgent: IPHONE, hasTouch: true });
  test('a 48 MP photo is saved smaller, and says so', async ({ page }) => {
    test.setTimeout(240_000);
    const got = await runOne(page, bg('photo-48mp.jpg'));
    if (REPORT) return console.log(`RESULT ${test.info().project.name} | 48 MP photo, iPhone browser | ${got.label}`);
    expect(got.label).toBe('ok');
    await expect(page.locator('#results-list')).toContainText('smaller than the photo');
  });
});

test.describe('on Android', () => {
  test.use({ userAgent: ANDROID, hasTouch: true });
  test('a save that returns nothing at full size is tried again smaller', async ({ page }) => {
    test.setTimeout(240_000);
    // The first save of a picture with more than 20 million pixels comes back empty, as it can on a phone short of memory.
    await page.addInitScript(() => {
      const convert = OffscreenCanvas.prototype.convertToBlob;
      OffscreenCanvas.prototype.convertToBlob = function (o) {
        if (this.width * this.height > 20_000_000) return Promise.reject(new Error('simulated: out of memory'));
        return convert.call(this, o);
      };
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
        if (this.width * this.height > 20_000_000) return cb(null);
        return toBlob.call(this, cb, type, q);
      };
    });
    const got = await runOne(page, bg('photo-48mp.jpg'));
    if (REPORT) return console.log(`RESULT ${test.info().project.name} | save fails at full size, Android | ${got.label}`);
    expect(got.label).toBe('ok');
    await expect(page.locator('#results-list')).toContainText('smaller than the photo');
  });
});
