import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const TALK_VIDEO = fileURLToPath(new URL('./fixtures/static/talk.webm', import.meta.url));

// When the browser's own decoder refuses a video's sound (some Android builds do for formats they list but cannot
// read), the page decodes the track itself with WebCodecs and the run still writes its captions.
test('a video whose sound the browser decoder refuses is decoded by the page instead', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    OfflineAudioContext.prototype.decodeAudioData = () => Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
  });
  await page.goto('/tools/transcribe');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(TALK_VIDEO);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect(page.locator('#results-list')).toContainText(/English speech/);
});
