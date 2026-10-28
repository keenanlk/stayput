// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A file the browser will not read is recorded by where it stopped: NotReadableProbe (the first or last byte is out of reach),
// NotReadableMidRead (a read part-way fails) or OutOfMemoryError (the read needed memory the device did not have). Only error_class
// carries it. The failures are armed after the file is added, so the intake check at pick time has already passed.
const tone = fileURLToPath(new URL('./fixtures/generated/tone.wav', import.meta.url));
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

type Mode = 'probe' | 'mid' | 'memory' | 'once';
function install() {
  const w = window as unknown as { __arm?: Mode; __reads: number };
  w.__reads = 0;
  const { arrayBuffer, stream } = Blob.prototype;
  const fail = (): Error => (w.__arm === 'memory' ? new RangeError('Array buffer allocation failed') : new DOMException('The requested file could not be read.', 'NotReadableError'));
  const bad = (b: Blob) => (w.__arm === 'probe' ? true : (w.__arm === 'once' || w.__arm === 'mid' || w.__arm === 'memory') && b.size > 1);
  Blob.prototype.arrayBuffer = function (this: Blob) {
    if (!bad(this)) return arrayBuffer.call(this);
    w.__reads++;
    if (w.__arm === 'once') w.__arm = undefined;
    return Promise.reject(fail());
  };
  Blob.prototype.stream = function (this: Blob) {
    if (!bad(this)) return stream.call(this);
    if (w.__arm === 'once') w.__arm = undefined;
    return new ReadableStream({ pull: (c) => c.error(fail()) });
  };
}

async function open(page: Page, path: string) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
  await page.addInitScript(install);
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}
const arm = (page: Page, mode: Mode) => page.evaluate((m) => ((window as unknown as { __arm: string }).__arm = m), mode);

async function runWith(page: Page, path: string, mode: Mode) {
  await open(page, path);
  await page.locator('#file-input').setInputFiles(tone);
  await expect(page.locator('#run')).toBeEnabled();
  await arm(page, mode);
  await page.locator('#run').click();
}
async function errorClass(page: Page) {
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length, { timeout: 60_000 }).toBe(1);
  return (await events(page)).find((e) => e.n === 'tool_run')!.d;
}

test.describe('NotReadableError is recorded by stage', () => {
  test('first byte out of reach: NotReadableProbe', async ({ page }) => {
    await runWith(page, '/tools/video-to-mp3', 'probe');
    expect(await errorClass(page)).toMatchObject({ outcome: 'error', error_class: 'NotReadableProbe' });
  });
  test('a read that fails part-way, with the file still reachable: NotReadableMidRead', async ({ page }) => {
    await runWith(page, '/tools/video-to-mp3', 'mid');
    expect(await errorClass(page)).toMatchObject({ outcome: 'error', error_class: 'NotReadableMidRead' });
    await expect(page.locator('#error')).toContainText('could not be read');
  });
  test('a read that cannot allocate: OutOfMemoryError', async ({ page }) => {
    await runWith(page, '/tools/volume-booster', 'memory');
    expect(await errorClass(page)).toMatchObject({ outcome: 'error', error_class: 'OutOfMemoryError' });
  });
});

test.describe('one re-read after one NotReadableError', () => {
  for (const path of ['/tools/video-to-mp3', '/tools/audio-splitter', '/tools/volume-booster']) {
    test(`${path} reads again and completes`, async ({ page }) => {
      await open(page, path);
      await arm(page, 'once');
      await page.locator('#file-input').setInputFiles(tone);
      if (path === '/tools/audio-splitter') await page.locator('#sp-times').fill('0.5');
      await expect(page.locator('#run')).toBeEnabled({ timeout: 30_000 });
      if (path !== '/tools/audio-splitter') {
        await arm(page, 'once');
      }
      await page.locator('#run').click();
      await expect(page.locator('#results-list .result-item').first()).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    });
  }

  test('/tools/vocal-remover reads again (it then needs a model this spec does not serve)', async ({ page }) => {
    await page.route('**/models/**', (r) => r.abort());
    await runWith(page, '/tools/vocal-remover', 'once');
    const d = await errorClass(page);
    expect(d.error_class).not.toMatch(/^NotReadable/);
    expect(await page.evaluate(() => (window as unknown as { __reads: number }).__reads)).toBe(1);
  });
});
