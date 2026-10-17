// @webkit-project
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The Done row after a run: no engine label ("with the processor") and no "captions" wording on a transcript, and a size
 * comparison only where the output is the same kind of thing as the input.
 */
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const SPOKEN = fixture('jfk.wav');

test('transcribe: no engine label, no captions wording, and no size delta for a .txt', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/tools/transcribe');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(SPOKEN);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  const list = page.locator('#results-list');
  await expect(list).toContainText(/English speech/);
  await expect(list).toContainText('.txt');
  for (const gone of ['with the processor', 'with the graphics chip', 'Wrote the captions', 'caption', '% smaller', '% larger']) {
    await expect(list, gone).not.toContainText(gone);
  }
});

test('auto caption video: the Done row has no engine label', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.goto('/auto-caption-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fixture(info.project.name === 'webkit' ? 'speech.mov' : 'talk.webm'));
  await page.locator('#run').click();
  await expect(page.locator('#results-list')).toContainText(/speech/, { timeout: 200_000 });
  await expect(page.locator('#results-list')).not.toContainText('with the processor');
  await expect(page.locator('#results-list')).not.toContainText('Wrote the captions');
});

test('compress image still shows the size delta', async ({ page }) => {
  await page.goto('/tools/compress-image');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fixture('frenchie.jpg'));
  await page.locator('#run').click();
  await expect(page.locator('#results-list')).toContainText(/% (smaller|larger)/, { timeout: 60_000 });
});
