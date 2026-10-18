import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { workerFailure } from '../src/lib/worker-error';

// Two failures that used to be recorded as a bare "TypeError" (video background remover, Chrome on Android) and as
// "WorkerFailed" (remove background, iOS): each step now records a class name of its own, and one failed run sends
// exactly one tool_run, however often Run is pressed afterwards.
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));
const photo = fileURLToPath(new URL('./fixtures/static/frenchie.jpg', import.meta.url));
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

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

test.describe('workerFailure names what has no name', () => {
  test('a nameless failure takes the step it came from', () => {
    expect(workerFailure(new Error("Can't create a session"), 'BackgroundModelLoadFailed').name).toBe('BackgroundModelLoadFailed');
    // onnxruntime throws bare numbers (a pointer into its memory) for some failures.
    expect(workerFailure(5242880, 'BackgroundModelRunFailed')).toEqual({ name: 'BackgroundModelRunFailed', message: '5242880' });
    expect(workerFailure(undefined, 'Step').name).toBe('Step');
  });
  test('no step given keeps the old fallback', () => {
    expect(workerFailure(new Error('x')).name).toBe('WorkerFailed');
  });
  test('no step given, a memory message stays WorkerFailed, as before the step names', () => {
    expect(workerFailure(new Error('Aborted(Assertion failed: bad state)')).name).toBe('WorkerFailed');
    expect(workerFailure(new Error('could not allocate 1048576 bytes')).name).toBe('WorkerFailed');
    expect(workerFailure('Aborted(OOM)')).toEqual({ name: 'WorkerFailed', message: 'Aborted(OOM)' });
  });
  test('memory running out is OutOfMemoryError, whatever it is called', () => {
    expect(workerFailure(new Error('Aborted(OOM). Build with -sASSERTIONS'), 'Step').name).toBe('OutOfMemoryError');
    expect(workerFailure('failed to allocate a buffer: out of memory', 'Step').name).toBe('OutOfMemoryError');
  });
  test('an error with a class name of its own keeps it', () => {
    expect(workerFailure(Object.assign(new Error('x'), { name: 'ModelDownloadError' }), 'Step').name).toBe('ModelDownloadError');
    expect(workerFailure(new RangeError('Invalid array length'), 'Step').name).toBe('RangeError');
  });
});

test('remove-background: a model file that cannot start records BackgroundModelLoadFailed, once per run', async ({ page }) => {
  test.setTimeout(120_000);
  await stubAnalytics(page);
  await page.route('**/models/isnet-general-use-int8w.onnx', (route) => route.fulfill({ contentType: 'application/octet-stream', body: Buffer.alloc(2048, 7) }));
  await page.goto('/tools/remove-background');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(photo);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 90_000 });
  // The failed start is tried once more in a new worker; the person still sees, and the counts still get, one failed run.
  const runs = await toolRuns(page);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ outcome: 'error', error_class: 'BackgroundModelLoadFailed' });
});

test('remove-background: a failed start that works in the fresh worker is one successful run', async ({ page }) => {
  test.setTimeout(180_000);
  await stubAnalytics(page);
  let served = 0;
  await page.route('**/models/isnet-general-use-int8w.onnx', (route) =>
    ++served === 1 ? route.fulfill({ contentType: 'application/octet-stream', body: Buffer.alloc(2048, 7) }) : route.continue(),
  );
  await page.goto('/tools/remove-background');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(photo);
  await page.locator('#run').click();
  await expect.poll(async () => (await toolRuns(page)).length, { timeout: 150_000 }).toBe(1);
  expect(served).toBeGreaterThan(1);
  const runs = await toolRuns(page);
  expect(runs[0]).toMatchObject({ outcome: 'ok' });
  expect(runs[0]).not.toHaveProperty('error_class');
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
});

test.describe('video background remover on Chrome for Android', () => {
  test.use({ userAgent: ANDROID, hasTouch: true });

  test('a frame the finder cannot draw records PersonFrameFailed, not TypeError, and Run again adds one more', async ({ page }) => {
    test.setTimeout(240_000);
    await stubAnalytics(page);
    // The mask is drawn through ImageData; a browser that cannot build one throws a plain TypeError there.
    await page.addInitScript(() => {
      const Real = window.ImageData;
      (window as unknown as { ImageData: unknown }).ImageData = class extends Real {
        constructor(...args: unknown[]) {
          if (args.length === 2) throw new TypeError("Failed to construct 'ImageData'");
          super(...(args as [ImageDataArray, number]));
        }
      };
    });
    await page.goto('/tools/video-background-remover');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles([clip]);
    await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
    let runs = await toolRuns(page);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ outcome: 'error', error_class: 'PersonFrameFailed' });
    await page.locator('#run').click();
    await expect.poll(async () => (await toolRuns(page)).length, { timeout: 200_000 }).toBe(2);
    runs = await toolRuns(page);
    expect(runs.every((r) => r.error_class === 'PersonFrameFailed')).toBe(true);
  });

  test('a script the browser could not fetch records ScriptLoadFailed and says to reload', async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnalytics(page);
    await page.route('**/_astro/person-mask*', (route) => route.abort('connectionreset'));
    await page.goto('/tools/video-background-remover');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles([clip]);
    await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 90_000 });
    await expect(page.locator('#error')).toContainText('reload the page');
    const runs = await toolRuns(page);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ outcome: 'error', error_class: 'ScriptLoadFailed' });
  });
});
