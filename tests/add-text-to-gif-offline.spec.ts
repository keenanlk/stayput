import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowServiceWorker } from './allow-sw';
import { gifFrom, readGif, whiteIn } from './gif-helpers';

/**
 * The page's own fonts (Archivo for the sans, Caveat for the handwriting) are served by this site
 * and kept by the service worker, so the text is drawn in them offline too.
 */
test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ context }) => allowServiceWorker(context));

test('after one visit the web fonts come from the service worker cache and the text is drawn offline', async ({ page, context }) => {
  await page.goto('/tools/add-text-to-gif');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(async () => page.evaluate(async () => (await (await caches.open('stayput-assets')).keys()).length), { timeout: 30_000 })
    .toBeGreaterThan(20);
  const cached = await page.evaluate(async () => (await (await caches.open('stayput-assets')).keys()).map((r) => new URL(r.url).pathname));
  for (const font of ['/fonts/archivo-var.woff2', '/fonts/caveat-500.woff2']) expect(cached, font).toContain(font);

  await context.setOffline(true);
  await page.goto('/tools/add-text-to-gif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const frames = [90, 20, 20].map((r, i) => ({ rgba: Uint8Array.from({ length: 120 * 80 * 4 }, (_, k) => (k % 4 === 3 ? 255 : [r, i * 30 + 20, 40][k % 4]!)) }));
  const file = join(mkdtempSync(join(tmpdir(), 'add-text-to-gif-offline-')), 'offline.gif');
  writeFileSync(file, await gifFrom({ w: 120, h: 80, frames, delays: [80, 80, 80], repeat: 0 }));
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#text-panel')).toBeVisible();
  await page.locator('#text1').fill('Aa');
  await page.locator('#effect').selectOption('none');
  await page.locator('#size').evaluate((el) => {
    (el as HTMLInputElement).value = '20';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (const font of ['hand', 'sans']) {
    await page.locator('#font').selectOption(font);
    // The font is ready once it has loaded from the cache; a fallback face would leave it unloaded.
    await expect
      .poll(() => page.evaluate((f) => [...document.fonts].some((x) => x.family.replace(/"/g, '') === f && x.status === 'loaded'), font === 'hand' ? 'Caveat' : 'Archivo'), { timeout: 15_000 })
      .toBe(true);
  }
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(1);
  const out = readGif(new Uint8Array(readFileSync((await downloads[0]!.path())!)));
  expect(out.frames).toHaveLength(3);
  for (const f of out.frames) expect(whiteIn(f, 120, { x: 0, y: 0, w: 120, h: 80 })).toBeGreaterThan(20);
  await context.setOffline(false);
});
