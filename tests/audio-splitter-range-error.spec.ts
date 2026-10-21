// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A RangeError while Audio splitter cuts or writes a part (a buffer the device cannot allocate, or a length that is too big)
// used to reach a failed run's record as plain "RangeError". It is OutOfMemoryError now, with words that say what to do.
const song = fileURLToPath(new URL('./fixtures/static/song.mp3', import.meta.url));
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

test('Audio splitter: a part that cannot be allocated records OutOfMemoryError, not RangeError', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
  // The finished WAV part is wrapped in a Blob; make that fail the way a device short of memory does.
  await page.addInitScript(() => {
    window.Blob = new Proxy(window.Blob, {
      construct(target, args: [BlobPart[]?, BlobPropertyBag?], newTarget) {
        if ((window as unknown as { __arm?: boolean }).__arm && args[1]?.type === 'audio/wav') throw new RangeError('Invalid array buffer length');
        return Reflect.construct(target, args, newTarget);
      },
    });
  });
  await page.goto('/tools/audio-splitter');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(song);
  await expect(page.locator('#tool')).toHaveAttribute('data-duration', /\d/);
  await page.locator('#sp-times').fill('0:01');
  await page.locator('#format').selectOption('wav');
  await page.evaluate(() => ((window as unknown as { __arm: boolean }).__arm = true));
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText('ran out of memory');
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'error', error_class: 'OutOfMemoryError' });
});
