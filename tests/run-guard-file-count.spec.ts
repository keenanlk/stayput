// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Run stays off until the list can be run: one video and one sound file for Add audio / Add music to video, two to
// 100 photos and at most one song for the slideshow maker. A hint above Run says what is missing. A run that still
// reaches the count check (Run forced on) ends as InputError.
const fx = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));
const video = fx('split-short-0.5s.mp4');
const sound = fx('song.mp3');
const photo = fx('pug.jpg');

async function open(page: Page, path: string) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

const hint = (page: Page) => page.locator('#run-hint');

for (const path of ['/tools/add-audio-to-video', '/add-music-to-video']) {
  test.describe(path, () => {
    test('Run stays off with no files, only a video, only a sound file, or three files, and the hint says why', async ({ page }) => {
      await open(page, path);
      await expect(page.locator('#run')).toBeDisabled();
      await expect(hint(page)).toContainText('Add one video and one sound file');

      await page.locator('#file-input').setInputFiles([video]);
      await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
      await expect(hint(page)).toContainText('Add a sound file too');
      await expect(page.locator('#run')).toBeDisabled();

      await page.locator('#clear').click();
      await page.locator('#file-input').setInputFiles([sound]);
      await expect(hint(page)).toContainText('Add a video too');
      await expect(page.locator('#run')).toBeDisabled();

      await page.locator('#clear').click();
      await page.locator('#file-input').setInputFiles([video, sound, fx('tone.m4a')]);
      await expect(page.locator('#tool')).toHaveAttribute('data-count', '3');
      await expect(hint(page)).toContainText('Remove 1 file');
      await expect(page.locator('#run')).toBeDisabled();
    });

    test('a run that still reaches the count check ends as InputError', async ({ page }) => {
      await open(page, path);
      await page.locator('#file-input').setInputFiles([video]);
      await expect(hint(page)).toContainText('Add a sound file too');
      await page.evaluate(() => ((document.getElementById('run') as HTMLButtonElement).disabled = false));
      await page.locator('#run').click();
      await expect(page.locator('#error')).toHaveClass(/is-active/);
      await expect(page.locator('#error')).toContainText('Add a sound file too');
      const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events);
      expect(events.filter((e) => e.n === 'tool_run').map((e) => e.d.error_class)).toEqual(['InputError']);
    });

    test('a video and a sound file enable Run and complete; removing the sound file turns it off again', async ({ page }) => {
      test.setTimeout(180_000);
      await open(page, path);
      await page.locator('#file-input').setInputFiles([video, sound]);
      await expect(page.locator('#tool')).toHaveAttribute('data-count', '2');
      await expect(page.locator('#run')).toBeEnabled();
      await expect(hint(page)).toBeHidden();
      await page.locator('#run').click();
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
      await expect(page.locator('#error')).not.toHaveClass(/is-active/);

      await page.locator('#clear').click();
      await page.locator('#file-input').setInputFiles([video, sound]);
      await page.getByRole('button', { name: `Remove song.mp3` }).click();
      await expect(page.locator('#run')).toBeDisabled();
      await expect(hint(page)).toContainText('Add a sound file too');
    });
  });
}

test.describe('photo slideshow maker', () => {
  test('Run stays off without two photos, with two songs, or over 100 photos; two photos enable it', async ({ page }) => {
    await open(page, '/tools/photo-slideshow-maker');
    await expect(page.locator('#run')).toBeDisabled();
    await expect(hint(page)).toContainText('at least two photos');

    await page.locator('#file-input').setInputFiles([photo]);
    await expect(hint(page)).toContainText('one more photo');
    await expect(page.locator('#run')).toBeDisabled();

    await page.locator('#file-input').setInputFiles([fx('frenchie.jpg')]);
    await expect(page.locator('#tool')).toHaveAttribute('data-count', '2');
    await expect(page.locator('#run')).toBeEnabled();

    await page.locator('#file-input').setInputFiles([sound, fx('tone.m4a')]);
    await expect(hint(page)).toContainText('Remove 1 song');
    await expect(page.locator('#run')).toBeDisabled();

    await page.locator('#clear').click();
    const many = Array.from({ length: 101 }, (_, i) => ({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: readFileSync(photo) }));
    await page.locator('#file-input').setInputFiles(many);
    await expect(hint(page)).toContainText('Remove 1 photo');
    await expect(page.locator('#run')).toBeDisabled();
  });
});
