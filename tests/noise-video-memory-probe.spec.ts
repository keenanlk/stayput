// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A phone that runs out of memory while the noise remover is only looking for the video's tracks used to be told
// "no video this page can read" (UnreadableFile): the track probe turned every failure but NotReadableError into "none".
// The probe now lets a memory failure through, so the run ends as OutOfMemoryError, which says what to do.
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

test('running out of memory while the video is opened ends as OutOfMemoryError, not "no video"', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    let armed = false;
    addEventListener('DOMContentLoaded', () => {
      const text = document.querySelector('#progress-text')!;
      new MutationObserver(() => {
        if (/Reading the sound/.test(text.textContent ?? '')) armed = true;
      }).observe(text, { childList: true, characterData: true, subtree: true });
    });
    const oom = () => new RangeError('Array buffer allocation failed');
    const { arrayBuffer, stream } = Blob.prototype;
    Blob.prototype.arrayBuffer = function () {
      return armed ? Promise.reject(oom()) : arrayBuffer.call(this);
    };
    Blob.prototype.stream = function () {
      return armed ? new ReadableStream({ pull: (c) => c.error(oom()) }) : stream.call(this);
    };
  });
  await page.goto('/remove-background-noise-from-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fixture('speech.mov'));
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).not.toContainText('no video this page can read');
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  const run = (await events(page)).find((e) => e.n === 'tool_run')!;
  expect(run.d).toMatchObject({ outcome: 'error', error_class: 'OutOfMemoryError' });
});
