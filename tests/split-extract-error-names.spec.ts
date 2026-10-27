// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Two failures that reached a failed run's record as a bare "TypeError": the cutting code (Video splitter) or the MP3
// encoder (Extract audio from video) failing to load when the connection drops. A failed fetch is a TypeError in every
// browser; the run now records a class that names the step.
const fx = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));
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

async function errorClass(page: Page) {
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length, { timeout: 120_000 }).toBe(1);
  return (await events(page)).find((e) => e.n === 'tool_run')!.d;
}

test.describe('on the page', () => {
  test.setTimeout(300_000);

  test('Video splitter: the cutting code failing to load records CutToolLoadFailed, not TypeError', async ({ page }) => {
    await open(page);
    await page.route(/\/_astro\/video-trim[^/]*\.js/, (route) => route.abort());
    await page.goto('/tools/video-splitter');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(fx('split-60s.mp4'));
    await expect(page.locator('#tool')).toHaveAttribute('data-duration', '60');
    await page.locator('input[name="vs-mode"][value="equal"]').check();
    await page.locator('#vs-equal').fill('2');
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
    expect(await errorClass(page)).toMatchObject({ outcome: 'error', error_class: 'CutToolLoadFailed' });
  });

  test('Extract audio from video: the MP3 encoder failing to load records Mp3EncodeFailed, not TypeError', async ({ page }) => {
    await open(page);
    await page.route('**/mp3.wasm', (route) => route.abort());
    await page.goto('/extract-audio-from-video');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('input[name="format"][value="mp3"], #format').first().evaluate((el) => {
      if (el instanceof HTMLSelectElement) el.value = 'mp3';
    });
    await page.locator('#file-input').setInputFiles(fx('tone-16k-mono.mp4'));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
    expect(await errorClass(page)).toMatchObject({ outcome: 'error', error_class: 'Mp3EncodeFailed' });
  });
});
