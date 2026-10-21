import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// An iPhone hands over a video from Photos with an empty type and a .MOV name, and a HEIC photo (from the Files app, or dragged)
// often with an empty type too. Both are sorted correctly: the photo is the new background, not a second "video".
const clip = readFileSync(fileURLToPath(new URL('./fixtures/static/iphone-portrait-person-3s.mov', import.meta.url)));
const heic = readFileSync(fileURLToPath(new URL('./fixtures/static/tiny.heic', import.meta.url)));
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

test.use({ userAgent: IPHONE, hasTouch: true });

async function open(page: import('@playwright/test').Page) {
  await page.goto('/tools/video-background-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

test('a video and a HEIC photo with empty types: the photo becomes the background and the run finishes', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  await page.locator('#file-input').setInputFiles([
    { name: 'IMG_0001.MOV', mimeType: '', buffer: clip },
    { name: 'IMG_0002.HEIC', mimeType: '', buffer: heic },
  ]);
  await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 250_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect(page.locator('#results-list')).toContainText('background from IMG_0002.HEIC');
});

test('a HEIC photo alone is still asked for a video, in words that say what to do', async ({ page }) => {
  await open(page);
  await page.locator('#file-input').setInputFiles([{ name: 'IMG_0002.HEIC', mimeType: '', buffer: heic }]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(page.locator('#error')).toContainText('Add a video too');
});
