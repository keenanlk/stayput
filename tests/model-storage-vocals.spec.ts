// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { allowServiceWorker } from './allow-sw';
import { faultInWorkers, flipKept, kept, patchWorkers, persistCalls, recordAnalytics, spyPersist, toolRuns } from './model-storage-helpers';

/**
 * The vocal remover's 67 MB model: resumed when the connection drops, checked against the build's SHA-256 before it is
 * kept or used, refused up front when offline or when there is no room, and never left half-written in the cache.
 */
test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ context }) => allowServiceWorker(context));

const SONG = fileURLToPath(new URL('./fixtures/static/song.mp3', import.meta.url));
const MODEL = '/models/uvr-mdx-net-inst-hq-3.onnx';
const FILE = fileURLToPath(new URL(`../public${MODEL}`, import.meta.url));
const SHA = createHash('sha256').update(readFileSync(FILE)).digest('hex');
const CACHE = 'stayput-models-v1';

async function open(page: Page) {
  await page.goto('/tools/vocal-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}
async function run(page: Page) {
  await page.locator('#file-input').setInputFiles(SONG);
  await page.locator('#run').click();
}
const done = (page: Page) => expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 240_000 });
const failed = (page: Page, timeout = 60_000) => expect(page.locator('#error')).toHaveClass(/is-active/, { timeout });

test('a download cut at 10% and again at 50% is resumed with Range requests, kept whole, and run once', async ({ page, context }) => {
  test.setTimeout(420_000);
  await recordAnalytics(page);
  await spyPersist(page);
  await faultInWorkers(page, { match: MODEL, cuts: [0.1, 0.5, null] });
  const requests: string[] = [];
  context.on('request', (r) => r.url().includes(MODEL) && requests.push(r.url()));
  await open(page);
  expect(await persistCalls(page)).toBe(0);
  await run(page);
  await done(page);
  expect(requests).toHaveLength(3);
  expect(await kept(page, CACHE)).toEqual({ [MODEL]: { size: readFileSync(FILE).length, sha256: SHA } });
  const runs = await toolRuns(page, 1);
  expect(runs[0]).toMatchObject({ tool: 'vocal-remover', outcome: 'ok' });
  // persist() is asked for once, after the first run that worked; a second run does not ask again.
  await expect.poll(() => persistCalls(page)).toBe(1);
  await page.locator('#run').click();
  await toolRuns(page, 2, 240_000);
  expect(await persistCalls(page)).toBe(1);
});

test('a server that ignores Range sends the file again from its start and the run still finishes', async ({ page, context }) => {
  test.setTimeout(420_000);
  await faultInWorkers(page, { match: MODEL, cuts: [0.5, null], ranges: false });
  const requests: string[] = [];
  context.on('request', (r) => r.url().includes(MODEL) && requests.push(r.url()));
  await open(page);
  await run(page);
  await done(page);
  expect(requests).toHaveLength(2);
  expect((await kept(page, CACHE))[MODEL]?.sha256).toBe(SHA);
});

test('a download that keeps dying fails as ModelDownloadError and leaves nothing in the cache', async ({ page }) => {
  test.setTimeout(120_000);
  await recordAnalytics(page);
  // Every response, the first and each resume, dies at 10%.
  await faultInWorkers(page, { match: MODEL, cuts: [0.1, 0.1, 0.1, 0.1, 0.1] });
  await open(page);
  await run(page);
  await failed(page);
  await expect(page.locator('#error')).toContainText('could not be downloaded');
  expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'ModelDownloadError' })]);
  expect(await kept(page, CACHE)).toEqual({});
});

test('a kept copy with flipped bytes is evicted, fetched again once, and the run succeeds', async ({ page, context }) => {
  test.setTimeout(600_000);
  await open(page);
  await run(page);
  await done(page);
  expect((await kept(page, CACHE))[MODEL]?.sha256).toBe(SHA);
  await page.close();
  // A new page for each run: WebKit crashes a page that has held the model once already.
  const again = await context.newPage();
  await open(again);
  await flipKept(again, CACHE, MODEL);
  expect((await kept(again, CACHE))[MODEL]?.sha256).not.toBe(SHA);
  const requests: string[] = [];
  context.on('request', (r) => r.url().includes(MODEL) && requests.push(r.url()));
  await run(again);
  await done(again);
  expect(requests).toHaveLength(1);
  expect((await kept(again, CACHE))[MODEL]?.sha256).toBe(SHA);
});

test('offline with no kept model is ModelOffline within 2 s and makes no request for it; with the model kept, the run works offline', async ({ browserName, page, context }) => {
    test.skip(browserName === 'webkit', "Playwright's WebKit cannot read a chosen file while its offline switch is on (NotReadableError), so there is nothing to run; Chromium and the unit tests cover offline");
  test.setTimeout(600_000);
  await recordAnalytics(page);
  const requests: string[] = [];
  context.on('request', (r) => r.url().includes(MODEL) && requests.push(r.url()));
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
  await open(page);
  await context.setOffline(true);
  const started = Date.now();
  await run(page);
  await failed(page, 2_000);
  expect(Date.now() - started).toBeLessThan(4_000);
  expect(requests).toEqual([]);
  expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'ModelOffline' })]);
  await context.setOffline(false);
  await page.close();
  const second = await context.newPage();
  await open(second);
  await run(second);
  await done(second);
  expect(requests).toHaveLength(1);
  await second.close();
  await context.setOffline(true);
  const third = await context.newPage();
  await open(third);
  await run(third);
  await done(third);
  expect(requests).toHaveLength(1);
});

test('less free storage than the model needs is StorageFull before any download', async ({ page, context }) => {
  test.setTimeout(120_000);
  await recordAnalytics(page);
  await patchWorkers(page, () => {
    StorageManager.prototype.estimate = () => Promise.resolve({ quota: 80e6, usage: 40e6 });
  });
  const requests: string[] = [];
  context.on('request', (r) => r.url().includes(MODEL) && requests.push(r.url()));
  await open(page);
  await run(page);
  await failed(page);
  expect(requests).toEqual([]);
  expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'StorageFull' })]);
  expect(await kept(page, CACHE)).toEqual({});
});

test('a cache that refuses the write (QuotaExceededError) leaves nothing behind and the run uses the downloaded bytes', async ({ page }) => {
  test.setTimeout(420_000);
  await recordAnalytics(page);
  await patchWorkers(page, () => {
    Cache.prototype.put = () => Promise.reject(new DOMException('full', 'QuotaExceededError'));
  });
  await open(page);
  await run(page);
  await done(page);
  expect(await kept(page, CACHE)).toEqual({});
  expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'ok' })]);
});

test('a worker that dies is WorkerCrashError, not a bare Error', async ({ page }) => {
  test.setTimeout(60_000);
  await recordAnalytics(page);
  await page.addInitScript(() => {
    const Real = window.Worker;
    // A worker whose script throws at once, like one the browser killed.
    (window as unknown as { Worker: unknown }).Worker = class extends Real {
      constructor(_url: string | URL, options?: WorkerOptions) {
        super(URL.createObjectURL(new Blob(['throw new Error("boom")'], { type: 'text/javascript' })), options);
      }
    };
  });
  await open(page);
  await run(page);
  await failed(page);
  await expect(page.locator('#error')).toContainText('ran short of memory');
  expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'WorkerCrashError' })]);
});
