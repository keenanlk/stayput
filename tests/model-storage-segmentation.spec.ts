// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { allowServiceWorker } from './allow-sw';
import { faultInPage, flipKept, kept, persistCalls, recordAnalytics, spyPersist, toolRuns } from './model-storage-helpers';

/**
 * The MediaPipe models (face finder 0.2 MB, person finder 0.25 MB or 16 MB): fetched whole through the shared loader
 * and handed over as a buffer, so a dropped connection is resumed, a damaged kept copy is replaced, and a model that
 * cannot be had ends in a named error with nothing half-written in the cache.
 */
// The offline cases need the page's own scripts from the service worker's cache, as a returning visitor has them.
test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ context }) => allowServiceWorker(context));
async function activeWorker(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
}
const at = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const manifest: Record<string, { size: number; sha256: string }> = JSON.parse(readFileSync(fileURLToPath(new URL('../src/data/model-manifest.json', import.meta.url)), 'utf8'));
const CACHE = 'stayput-models-v1';
const FACE = '/models/blaze_face_short_range.tflite';
const PERSON = '/models/selfie_segmenter.tflite';
const PERSON_WIDE = '/models/selfie_segmenter_landscape.tflite';

test('the manifest sizes of the segmentation models match the files on disk', () => {
  for (const path of [FACE, PERSON, PERSON_WIDE, '/models/selfie_multiclass_256x256.tflite']) {
    expect(manifest[path]!.size).toBe(readFileSync(fileURLToPath(new URL(`../public${path}`, import.meta.url))).length);
  }
});

test.describe('face finder (blur a face in a photo)', () => {
  async function find(page: Page) {
    await page.goto('/blur-face');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(at('face.jpg'));
  }
  const hint = (page: Page) => page.locator('#blur-hint');
  const found = (page: Page) => expect(hint(page)).toContainText(/Found \d+ faces?|No faces found/, { timeout: 60_000 });

  test('a download cut at 10% and again at 50% is resumed and kept whole', async ({ page, context }) => {
    await faultInPage(page, { match: FACE, cuts: [0.1, 0.5, null] });
    const requests: string[] = [];
    context.on('request', (r) => r.url().includes(FACE) && requests.push(r.url()));
    await find(page);
    await found(page);
    expect(requests).toHaveLength(3);
    expect(await kept(page, CACHE)).toEqual({ [FACE]: manifest[FACE] });
  });

  test('a server that ignores Range sends the file again, and the face finder starts', async ({ page, context }) => {
    await faultInPage(page, { match: FACE, cuts: [0.5, null], ranges: false });
    const requests: string[] = [];
    context.on('request', (r) => r.url().includes(FACE) && requests.push(r.url()));
    await find(page);
    await found(page);
    expect(requests).toHaveLength(2);
  });

  test('a download that keeps dying says so, and nothing is kept', async ({ page }) => {
    await faultInPage(page, { match: FACE, cuts: Array(8).fill(0.1) });
    await find(page);
    await expect(hint(page)).toContainText('could not be downloaded', { timeout: 30_000 });
    expect(await kept(page, CACHE)).toEqual({});
  });

  test('a kept copy with flipped bytes is evicted and fetched again once', async ({ page, context }) => {
    await find(page);
    await found(page);
    await flipKept(page, CACHE, FACE);
    const requests: string[] = [];
    context.on('request', (r) => r.url().includes(FACE) && requests.push(r.url()));
    await find(page);
    await found(page);
    expect(requests).toHaveLength(1);
    expect(await kept(page, CACHE)).toEqual({ [FACE]: manifest[FACE] });
  });

  test('offline with no kept model is ModelOffline with no request; kept, it works offline', async ({ page, context }) => {
    const requests: string[] = [];
    context.on('request', (r) => r.url().includes(FACE) && requests.push(r.url()));
    await activeWorker(page);
    await page.goto('/blur-face');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await context.setOffline(true);
    await page.locator('#file-input').setInputFiles(at('face.jpg'));
    await expect(hint(page)).toContainText('you are offline', { timeout: 2_000 });
    expect(requests).toEqual([]);
    await context.setOffline(false);
    await find(page);
    await found(page);
    expect(requests).toHaveLength(1);
    await context.setOffline(true);
    await page.locator('#file-input').setInputFiles(at('face.jpg'));
    await expect(hint(page)).not.toContainText('could not start', { timeout: 10_000 });
    await found(page);
    expect(requests).toHaveLength(1);
  });

  test('less free storage than the model needs is StorageFull; a cache that refuses the write still lets the finder start', async ({ page, context }) => {
    await page.addInitScript(() => {
      navigator.storage.estimate = () => Promise.resolve({ quota: 100_000, usage: 0 });
    });
    const requests: string[] = [];
    context.on('request', (r) => r.url().includes(FACE) && requests.push(r.url()));
    await find(page);
    await expect(hint(page)).toContainText('not enough free storage', { timeout: 10_000 });
    expect(requests).toEqual([]);

    const refusing = await page.context().newPage();
    await refusing.addInitScript(() => {
      Cache.prototype.put = () => Promise.reject(new DOMException('full', 'QuotaExceededError'));
    });
    await find(refusing);
    await found(refusing);
    expect(await kept(refusing, CACHE)).toEqual({});
  });
});

test.describe('person finder (video background remover, the quick finder)', () => {
  const CLIP = at('iphone-portrait-person-3s.mov');
  async function start(page: Page) {
    await page.goto('/tools/video-background-remover');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles([CLIP]);
    await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
    await page.locator('#run').click();
  }
  const SELFIE = /selfie_segmenter(_landscape)?\.tflite$/;
  const keptPerson = async (page: Page) => Object.entries(await kept(page, CACHE)).filter(([p]) => SELFIE.test(p));

  test('a download cut at 10% and again at 50% is resumed; the run completes and is recorded once as ok', async ({ page }) => {
    test.setTimeout(420_000);
    await recordAnalytics(page);
    await spyPersist(page);
    await faultInPage(page, { match: 'selfie_segmenter', cuts: [0.1, 0.5, null] });
    await start(page);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 360_000 });
    const person = await keptPerson(page);
    expect(person).toHaveLength(1);
    expect(person[0]![1]).toEqual(manifest[person[0]![0]]);
    expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ tool: 'video-background-remover', outcome: 'ok' })]);
    await expect.poll(() => persistCalls(page)).toBe(1);
  });

  test('a download that keeps dying is ModelDownloadError, with nothing kept', async ({ page }) => {
    test.setTimeout(120_000);
    await recordAnalytics(page);
    await faultInPage(page, { match: 'selfie_segmenter', cuts: Array(8).fill(0.1) });
    await start(page);
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(page.locator('#error')).toContainText('person finder');
    expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'ModelDownloadError' })]);
    expect(await keptPerson(page)).toEqual([]);
  });

  test('offline with no kept model is ModelOffline, with no model request', async ({ page, context }) => {
    test.setTimeout(120_000);
    await recordAnalytics(page);
    const requests: string[] = [];
    context.on('request', (r) => SELFIE.test(r.url()) && requests.push(r.url()));
    await activeWorker(page);
    await page.goto('/tools/video-background-remover');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles([CLIP]);
    await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
    await context.setOffline(true);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
    expect(requests).toEqual([]);
    expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'ModelOffline' })]);
  });

  test('a kept copy with flipped bytes is evicted and fetched again once', async ({ page, context }) => {
    test.setTimeout(420_000);
    await start(page);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 360_000 });
    const [path] = (await keptPerson(page))[0]!;
    await flipKept(page, CACHE, path);
    const requests: string[] = [];
    context.on('request', (r) => r.url().endsWith(path) && requests.push(r.url()));
    await start(page);
    await expect.poll(async () => (await keptPerson(page))[0]?.[1].sha256, { timeout: 120_000 }).toBe(manifest[path]!.sha256);
    expect(requests).toHaveLength(1);
  });

  test('less free storage than the model needs is StorageFull, before any download', async ({ page, context }) => {
    test.setTimeout(120_000);
    await recordAnalytics(page);
    await page.addInitScript(() => {
      navigator.storage.estimate = () => Promise.resolve({ quota: 100_000, usage: 0 });
    });
    const requests: string[] = [];
    context.on('request', (r) => SELFIE.test(r.url()) && requests.push(r.url()));
    await start(page);
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    expect(requests).toEqual([]);
    expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'StorageFull' })]);
  });
});
