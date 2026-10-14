import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { allowServiceWorker } from './allow-sw';

/** The monospace font is precached with the rest of the site, so "after one visit" holds for Text to PDF. */
test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ context }) => allowServiceWorker(context));

test('after one visit the monospace font comes from the cache and the PDF is made offline', async ({ page, context }) => {
  await page.goto('/tools/text-to-pdf');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(async () => page.evaluate(async () => (await (await caches.open('stayput-assets')).keys()).length), { timeout: 30_000 })
    .toBeGreaterThan(20);
  const cached = await page.evaluate(async () => (await (await caches.open('stayput-assets')).keys()).map((r) => new URL(r.url).pathname));
  expect(cached).toContain('/fonts/DejaVuSansMono-subset.ttf');

  await context.setOffline(true);
  await page.goto('/tools/text-to-pdf');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#tp-text').fill('offline → ✓');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#tp-make').click()]);
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  // Both fonts are embedded: Roboto for the words, DejaVu for the symbols.
  const text = bytes.toString('latin1');
  expect(text).toMatch(/DejaVuSansMono/);
});
