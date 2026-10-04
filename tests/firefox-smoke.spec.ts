import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A small cross-engine smoke test. CI runs it in Firefox (see playwright.config.ts);
// the Chromium project skips it because tools.spec.ts covers every tool in depth.
const gen = (name: string) => fileURLToPath(new URL(`./fixtures/generated/${name}`, import.meta.url));
const stat = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/** Add the files, run, and return the name of the single downloaded file. */
async function convert(page: Page, slug: string, files: string[]) {
  const errors = watch(page);
  await page.goto(`/tools/${slug}`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const download = page.waitForEvent('download');
  await page.locator('#file-input').setInputFiles(files);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const name = (await download).suggestedFilename();
  expect(errors).toEqual([]);
  return name;
}

test('home page loads and the demo video plays', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Your files stay put.');
  const video = page.locator('.demo video');
  await video.scrollIntoViewIfNeeded();
  await expect(video).toHaveAttribute('poster', /poster\.webp$/);
  await video.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.5);
  expect(await video.evaluate((v: HTMLVideoElement) => [v.error, v.muted])).toEqual([null, true]);
  expect(errors).toEqual([]);
});

test('HEIC to JPG converts', async ({ page }) => {
  expect(await convert(page, 'heic-to-jpg', [gen('iphone.heic')])).toBe('iphone.jpg');
});

test('Compress image converts', async ({ page }) => {
  expect(await convert(page, 'compress-image', [gen('photo.jpg')])).toBe('photo.jpg');
});

test('Strip EXIF converts', async ({ page }) => {
  expect(await convert(page, 'strip-exif', [gen('photo.jpg')])).toBe('photo.jpg');
});

test('Merge PDF combines two files', async ({ page }) => {
  expect(await convert(page, 'merge-pdf', [gen('text.pdf'), gen('article.pdf')])).toBe('merged.pdf');
});

test('Video to GIF converts', async ({ page }) => {
  expect(await convert(page, 'video-to-gif', [stat('clip.webm')])).toBe('clip.gif');
});

test('keyboard only: focus the drop zone, add a file, run, and get the download', async ({ page }) => {
  await page.goto('/tools/compress-image');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  for (let i = 0; i < 30 && (await page.evaluate(() => document.activeElement?.id)) !== 'drop'; i++) await page.keyboard.press('Tab');
  await expect(page.locator('#drop')).toBeFocused();
  // The native file dialog cannot be driven, so Playwright answers it.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
  await chooser.setFiles(gen('photo.jpg'));
  for (let i = 0; i < 40 && (await page.evaluate(() => document.activeElement?.id)) !== 'run'; i++) await page.keyboard.press('Tab');
  await expect(page.locator('#run')).toBeFocused();
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toBe('photo.jpg');
});
