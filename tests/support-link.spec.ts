// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const KOFI = 'https://ko-fi.com/stayputdev';
// A 2x2, two-frame GIF, small enough to embed.
const gif = {
  name: 'tiny.gif',
  mimeType: 'image/gif',
  buffer: Buffer.from('R0lGODlhAgACAPAAAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJCgAAACwAAAAAAgACAAACAkQBACH5BAkKAAAALAAAAAACAAIAAAIChEQAOw==', 'base64'),
};
const jpg = fileURLToPath(new URL('./fixtures/static/frenchie.jpg', import.meta.url));

/** Records every request host so a test can show the Ko-fi page was never contacted. */
function watchHosts(page: Page) {
  const hosts = new Set<string>();
  page.on('request', (r) => hosts.add(new URL(r.url()).hostname));
  return hosts;
}

async function expectPlainLink(link: ReturnType<Page['locator']>) {
  await expect(link).toHaveAttribute('href', KOFI);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener');
}

test('the footer and the about page link to Ko-fi without contacting it', async ({ page }) => {
  const hosts = watchHosts(page);
  await page.goto('/about');
  await expectPlainLink(page.locator(`main a[href="${KOFI}"], article a[href="${KOFI}"]`));
  await expectPlainLink(page.locator(`footer a[href="${KOFI}"]`));
  await page.goto('/tools/compress-image');
  await expectPlainLink(page.locator(`footer a[href="${KOFI}"]`));
  expect([...hosts].filter((h) => h.includes('ko-fi'))).toEqual([]);
  expect(await page.locator('iframe, script[src*="ko-fi"]').count()).toBe(0);
});

test('the link shows with the result of a successful run, not before', async ({ page }) => {
  const hosts = watchHosts(page);
  await page.goto('/tools/compress-image');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const note = page.locator(`#results a[href="${KOFI}"]`);
  await expect(note).toBeHidden();
  await page.locator('#file-input').setInputFiles(jpg);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(note).toBeVisible();
  await expectPlainLink(note);
  expect([...hosts].filter((h) => h.includes('ko-fi'))).toEqual([]);
  // Narrow screens: the page must not scroll sideways.
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the link is absent after a failed run', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
      constructor() {
        throw new TypeError('boom');
      }
    };
  });
  await page.goto('/tools/compress-gif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(gif);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#results')).not.toHaveClass(/is-active/);
  await expect(page.locator(`#results a[href="${KOFI}"]`)).toBeHidden();
});
