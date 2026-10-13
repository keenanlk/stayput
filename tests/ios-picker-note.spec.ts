import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// iOS's Photos picker prepares (transcodes or downloads) a video before the page sees it. The video tools say so
// on iPhone and iPad only, and trim shows a note while it opens the clip.
const NOTE = "Your iPhone may take a few seconds to prepare the video first, longer if it's stored in iCloud.";
const PAGES = ['/auto-caption-video', '/tools/video-background-remover', '/tools/compress-video', '/tools/trim-video', '/tools/video-to-mp3'];
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const clip = fileURLToPath(new URL('./fixtures/static/talk.webm', import.meta.url));

test.describe('iPhone', () => {
  test.use({ userAgent: IPHONE, hasTouch: true });
  for (const path of PAGES) {
    test(`${path} shows the picker note`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText(NOTE, { exact: true })).toBeVisible();
    });
  }
  test('other tools do not show it', async ({ page }) => {
    await page.goto('/tools/merge-pdf');
    await expect(page.locator('#ios-picker-note')).toHaveCount(0);
  });
});

test.describe('iPadOS reporting itself as a Mac', () => {
  test.use({ userAgent: MAC, hasTouch: true });
  test('shows the picker note', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
    await page.goto('/tools/compress-video');
    await expect(page.getByText(NOTE, { exact: true })).toBeVisible();
  });
});

test.describe('desktop', () => {
  test.use({ userAgent: MAC });
  for (const path of PAGES) {
    test(`${path} hides the picker note`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      await expect(page.getByText(NOTE, { exact: true })).toBeHidden();
    });
  }
});

test('trim shows "Loading preview…" until the duration is known', async ({ page }) => {
  await page.goto('/tools/trim-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __info: string[] }).__info = seen;
    const el = document.getElementById('vg-info')!;
    new MutationObserver(() => seen.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.locator('#file-input').setInputFiles({ name: 'talk.webm', mimeType: 'video/webm', buffer: readFileSync(clip) });
  await expect(page.locator('#vg-info')).toContainText('long. Play or scrub');
  await expect(page.locator('#vg-video')).toBeVisible();
  const seen = await page.evaluate(() => (window as unknown as { __info: string[] }).__info);
  expect(seen[0]).toBe('Loading preview…');
  expect(seen[seen.length - 1]).toMatch(/\d+ × \d+ px, \d+:\d\d\.\d long/);
});
