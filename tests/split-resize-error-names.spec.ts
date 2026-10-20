// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { memoryRange, nameBare } from '../src/lib/bare-error';

// Two failures that used to reach a failed run's record under a bare built-in name: a RangeError from a buffer that
// could not be allocated while cutting (Video splitter), and a TypeError while reading the size (Resize video).
const fx = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

test('a RangeError that says memory ran out is OutOfMemoryError; a bad length stays a step name', () => {
  const oom = memoryRange(new RangeError('Array buffer allocation failed')) as Error;
  expect(oom.name).toBe('OutOfMemoryError');
  expect(oom.cause).toBeInstanceOf(RangeError);
  const bad = memoryRange(new RangeError('Invalid typed array length: 4294967296'));
  expect((bad as Error).name).toBe('RangeError');
  expect(nameBare('CutFailed', bad).name).toBe('CutFailed');
  expect(memoryRange(new TypeError('x'))).toBeInstanceOf(TypeError);
  expect(nameBare('VideoSizeReadFailed', new TypeError("undefined is not an object (evaluating 'a.num')")).name).toBe('VideoSizeReadFailed');
});

async function open(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

async function errorClass(page: Page) {
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length, { timeout: 120_000 }).toBe(1);
  return (await events(page)).find((e) => e.n === 'tool_run')!.d;
}

test.describe('on the page', () => {
  test.setTimeout(300_000);

  test('Video splitter: a part that cannot be allocated records OutOfMemoryError, not RangeError', async ({ page }) => {
    await open(page);
    // The finished part is wrapped in a Blob; make that fail the way a device short of memory does.
    await page.addInitScript(() => {
      window.Blob = new Proxy(window.Blob, {
        construct(target, args: [BlobPart[]?, BlobPropertyBag?], newTarget) {
          if ((window as unknown as { __arm?: boolean }).__arm && args[1]?.type && /^video\//.test(args[1].type)) throw new RangeError('Array buffer allocation failed');
          return Reflect.construct(target, args, newTarget);
        },
      });
    });
    await page.goto('/tools/video-splitter');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(fx('split-60s.mp4'));
    await expect(page.locator('#tool')).toHaveAttribute('data-duration', '60');
    await page.locator('input[name="vs-mode"][value="equal"]').check();
    await page.locator('#vs-equal').fill('2');
    await page.evaluate(() => ((window as unknown as { __arm: boolean }).__arm = true));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
    await expect(page.locator('#error')).toContainText('ran out of memory');
    expect(await errorClass(page)).toMatchObject({ outcome: 'error', error_class: 'OutOfMemoryError' });
  });

  test('Resize video: a TypeError while reading the size is never recorded as TypeError', async ({ page }) => {
    await open(page);
    // Every read of the file fails with a TypeError, the way a browser quirk would, before any picture is made.
    await page.addInitScript(() => {
      const fail = () => {
        throw new TypeError("undefined is not an object (evaluating 'e.pixelAspectRatio.num')");
      };
      Blob.prototype.slice = fail;
      Blob.prototype.arrayBuffer = fail as never;
      Blob.prototype.stream = fail as never;
    });
    await page.goto('/tools/resize-video');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(fx('split-60s.mp4'));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
    const run = await errorClass(page);
    expect(run.outcome).toBe('error');
    expect(run.error_class).not.toBe('TypeError');
    expect(run.error_class).not.toMatch(/UnnamedError$/);
  });
});
