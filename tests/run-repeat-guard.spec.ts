// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { failsTheSameAgain } from '../src/lib/edit-recovery';
import { inspectFile, intakeError } from '../src/lib/intake';

// Run stays off after a failure the same file and options would repeat, so tapping it again cannot pile up the same error.
// Any change to the files or to an option turns it back on; a failure a second try can get past never turns it off.
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const clip = readFileSync(fixture('iphone-portrait-person-3s.mov'));
const png = readFileSync(fixture('logo-red.png'));
const HINT = 'To try again, change the file or an option.';
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
const runs = async (page: Page) => (await events(page)).filter((e) => e.n === 'tool_run');

async function open(page: Page, path: string) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

const notVideo = { name: 'holiday.mp4', mimeType: 'video/mp4', buffer: Buffer.from('plain text, not a video. '.repeat(300)) };

async function failOnce(page: Page) {
  await page.locator('#file-input').setInputFiles([notVideo]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(page.locator('#run')).toBeDisabled();
}

test.describe('a failure that would only repeat', () => {
  test('five taps on Run record one error; the hint names the reason and what to change', async ({ page }) => {
    await open(page, '/blur-video-background');
    await failOnce(page);
    for (let i = 0; i < 5; i++) await page.locator('#run').click({ force: true });
    await page.waitForTimeout(500);
    await expect.poll(async () => (await runs(page)).length).toBe(1);
    expect((await runs(page))[0]!.d).toMatchObject({ outcome: 'error', error_class: 'UnreadableFile' });
    await expect(page.locator('#run-hint')).toContainText('holiday.mp4 is not a video this page can read');
    await expect(page.locator('#run-hint')).toContainText(HINT);
  });

  test('a new file turns Run back on', async ({ page }) => {
    await open(page, '/blur-video-background');
    await failOnce(page);
    await page.locator('#file-input').setInputFiles([{ name: 'clip.mov', mimeType: 'video/quicktime', buffer: clip }]);
    await expect(page.locator('#run')).toBeEnabled();
    await expect(page.locator('#run-hint')).toBeHidden();
  });

  test('removing the file, then adding it again, turns Run back on', async ({ page }) => {
    await open(page, '/blur-video-background');
    await failOnce(page);
    await page.getByRole('button', { name: /^Remove / }).click();
    await page.locator('#file-input').setInputFiles([notVideo]);
    await expect(page.locator('#run')).toBeEnabled();
  });

  test('changing one option turns Run back on', async ({ page }) => {
    await open(page, '/blur-video-background');
    await failOnce(page);
    await page.locator('input[name="bg"][value="color"]').evaluate((el) => (el as HTMLInputElement).click());
    await expect(page.locator('#run')).toBeEnabled();
    await expect(page.locator('#run-hint')).toBeHidden();
  });

  test('a picture that will not open is said at the drop, with no run recorded; removing it turns Run on', async ({ page }) => {
    await open(page, '/blur-video-background');
    await page.locator('#file-input').setInputFiles([
      { name: 'clip.mov', mimeType: 'video/quicktime', buffer: clip },
      { name: 'background.png', mimeType: 'image/png', buffer: Buffer.from('this is not a picture '.repeat(100)) },
    ]);
    await expect(page.locator('#run')).toBeDisabled();
    await expect(page.locator('#run-hint')).toContainText('This picture could not be opened');
    for (let i = 0; i < 5; i++) await page.locator('#run').click({ force: true });
    expect(await runs(page)).toHaveLength(0);
    await page.getByRole('button', { name: 'Remove background.png' }).click();
    await expect(page.locator('#run')).toBeEnabled();
  });
});

test.describe('a failure a second try can get past', () => {
  test('Run stays on after it and the second run works', async ({ page }) => {
    // The first picture the page writes fails the way a busy browser does; the next one works.
    await page.addInitScript(() => {
      const w = window as unknown as { failNext?: boolean };
      const realToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, ...rest) {
        if (!w.failNext) return realToBlob.call(this, cb, ...rest);
        w.failNext = false;
        cb(null);
      };
      if (typeof OffscreenCanvas !== 'undefined') {
        const realConvert = OffscreenCanvas.prototype.convertToBlob;
        OffscreenCanvas.prototype.convertToBlob = function (...a) {
          if (!w.failNext) return realConvert.apply(this, a);
          w.failNext = false;
          return Promise.reject(new Error('busy'));
        };
      }
    });
    await open(page, '/tools/compress-image');
    await page.locator('#file-input').setInputFiles([{ name: 'logo.png', mimeType: 'image/png', buffer: png }]);
    await page.evaluate(() => ((window as unknown as { failNext?: boolean }).failNext = true));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
    await expect.poll(async () => (await runs(page)).length).toBe(1);
    expect((await runs(page))[0]!.d.outcome).toBe('error');
    await expect(page.locator('#run')).toBeEnabled();
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 30_000 });
    await expect.poll(async () => (await runs(page)).length).toBe(2);
    expect((await runs(page))[1]!.d.outcome).toBe('ok');
  });
});

// The two errors file intake (H3) gives, thrown the way intakeError throws them, against the H3 fixtures.
test.describe('the errors file intake gives', () => {
  test('a container nothing here opens repeats exactly, so it keeps Run off', async () => {
    const file = new File([readFileSync(fixture('blur-edge.avi'))], 'clip.avi', { type: 'video/x-msvideo' });
    const problem = await inspectFile(file, 'trim-video', 'trim-video', 'video/*');
    expect(problem?.name).toBe('UnsupportedContainer');
    const e = intakeError(problem!);
    expect(e.name).toBe('UnsupportedContainer');
    expect(failsTheSameAgain(e.name)).toBe(true);
  });

  test('a cloud-only file can read on the next try, so it does not keep Run off', async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024)], 'IMG_0001.mp4', { type: 'video/mp4' });
    const problem = await inspectFile(file, 'trim-video', 'trim-video', 'video/*');
    expect(problem?.name).toBe('FileNotDownloaded');
    const e = intakeError(problem!);
    expect(e.name).toBe('FileNotDownloaded');
    expect(failsTheSameAgain(e.name)).toBe(false);
  });
});
