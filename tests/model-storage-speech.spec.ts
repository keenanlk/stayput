// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { allowServiceWorker } from './allow-sw';
import { faultInWorkers, flipKept, kept, persistCalls, recordAnalytics, spyPersist, toolRuns } from './model-storage-helpers';

/**
 * The Whisper model (two files, 77 MB): resumed when the connection drops, each file checked against the build's SHA-256
 * before transformers.js keeps or uses it, refused up front when offline or when there is no room, and never left
 * half-written in the cache.
 */
test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ context }) => allowServiceWorker(context));

const SPOKEN = fileURLToPath(new URL('./fixtures/static/jfk.wav', import.meta.url));
const ENCODER = '/models/whisper-base/onnx/encoder_model_quantized.onnx';
const CACHE = 'transformers-cache';
const manifest: Record<string, { size: number; sha256: string }> = JSON.parse(readFileSync(fileURLToPath(new URL('../src/data/model-manifest.json', import.meta.url)), 'utf8'));
const entry = (path: string) => manifest[path]!;
const ANY_MODEL = /\/models\/whisper-base\//;

async function open(page: Page) {
  await page.goto('/tools/transcribe');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}
async function run(page: Page) {
  await page.locator('#file-input').setInputFiles(SPOKEN);
  await page.locator('#run').click();
}
const done = (page: Page) => expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
const failed = (page: Page, timeout = 90_000) => expect(page.locator('#error')).toHaveClass(/is-active/, { timeout });
async function activeWorker(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
}

test('the manifest names both Whisper files with the sizes on disk', () => {
  for (const f of ['encoder_model_quantized', 'decoder_model_merged_quantized']) {
    const path = `/models/whisper-base/onnx/${f}.onnx`;
    expect(entry(path).size).toBe(readFileSync(fileURLToPath(new URL(`../public${path}`, import.meta.url))).length);
  }
});

test('a download cut at 10% and again at 50% is resumed, kept whole and matching its hash, and run once', async ({ page, context }) => {
  test.setTimeout(240_000);
  await recordAnalytics(page);
  await spyPersist(page);
  await faultInWorkers(page, { match: ENCODER, cuts: [0.1, 0.5, null] });
  const requests: string[] = [];
  context.on('request', (r) => r.url().endsWith(ENCODER) && requests.push(r.url()));
  await open(page);
  expect(await persistCalls(page)).toBe(0);
  await run(page);
  await done(page);
  expect(requests).toHaveLength(3);
  expect((await kept(page, CACHE))[ENCODER]).toEqual(entry(ENCODER));
  expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ tool: 'transcribe', outcome: 'ok' })]);
  await expect.poll(() => persistCalls(page)).toBe(1);
});

test('a download that keeps dying is ModelDownloadError and the file is not in the cache', async ({ page }) => {
  test.setTimeout(240_000);
  await recordAnalytics(page);
  await faultInWorkers(page, { match: ENCODER, cuts: Array(30).fill(0.1) });
  await open(page);
  await run(page);
  await failed(page, 180_000);
  expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'ModelDownloadError' })]);
  expect((await kept(page, CACHE))[ENCODER]).toBeUndefined();
});

test('a server that ignores Range sends the file from its start again and the run finishes', async ({ page, context }) => {
  test.setTimeout(240_000);
  await faultInWorkers(page, { match: ENCODER, cuts: [0.5, null], ranges: false });
  const requests: string[] = [];
  context.on('request', (r) => r.url().endsWith(ENCODER) && requests.push(r.url()));
  await open(page);
  await run(page);
  await done(page);
  expect(requests).toHaveLength(2);
  expect((await kept(page, CACHE))[ENCODER]).toEqual(entry(ENCODER));
});

test('a kept file with flipped bytes (same size) is evicted, fetched again once, and the run succeeds', async ({ page, context }) => {
  test.setTimeout(300_000);
  await open(page);
  await run(page);
  await done(page);
  await flipKept(page, CACHE, ENCODER);
  expect((await kept(page, CACHE))[ENCODER]!.size).toBe(entry(ENCODER).size);
  expect((await kept(page, CACHE))[ENCODER]!.sha256).not.toBe(entry(ENCODER).sha256);
  const requests: string[] = [];
  context.on('request', (r) => r.url().endsWith(ENCODER) && requests.push(r.url()));
  await open(page);
  await run(page);
  await done(page);
  expect(requests).toHaveLength(1);
  expect((await kept(page, CACHE))[ENCODER]).toEqual(entry(ENCODER));
});

test('offline with no kept model is ModelOffline within 2 s and requests no model file; kept, it runs offline', async ({ page, context }) => {
  test.setTimeout(300_000);
  await recordAnalytics(page);
  const requests: string[] = [];
  context.on('request', (r) => ANY_MODEL.test(r.url()) && requests.push(r.url()));
  await activeWorker(page);
  await open(page);
  await context.setOffline(true);
  const started = Date.now();
  await run(page);
  await failed(page, 2_000);
  expect(Date.now() - started).toBeLessThan(4_000);
  expect(requests).toEqual([]);
  expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'ModelOffline' })]);
  await context.setOffline(false);
  await open(page);
  await run(page);
  await done(page);
  const online = requests.length;
  expect(online).toBeGreaterThan(0);
  await context.setOffline(true);
  await open(page);
  await run(page);
  await done(page);
  expect(requests).toHaveLength(online);
});

test('less free storage than the model needs is StorageFull, with no download started', async ({ page, context }) => {
  test.setTimeout(120_000);
  await recordAnalytics(page);
  await page.addInitScript(() => {
    navigator.storage.estimate = () => Promise.resolve({ quota: 100e6, usage: 60e6 });
  });
  const requests: string[] = [];
  context.on('request', (r) => ANY_MODEL.test(r.url()) && requests.push(r.url()));
  await open(page);
  await run(page);
  await failed(page, 30_000);
  expect(requests).toEqual([]);
  expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'StorageFull' })]);
  expect(await kept(page, CACHE)).toEqual({});
});
