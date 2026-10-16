// @webkit-project
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * One real transcription, with the real speech worker and model, on each page that runs the speech tool.
 * Meant for the live site: npm run test:live -- tests/speech-live-end-to-end.spec.ts
 */
const here = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));

for (const path of ['/tools/transcribe', '/video-to-subtitles']) {
  test(`${path} transcribes a short talk end to end`, async ({ page }, info) => {
    test.setTimeout(240_000);
    await page.goto(path);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(here(info.project.name === 'webkit' ? 'speech.mov' : 'talk.webm'));
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    await expect(page.locator('#results-list')).toContainText(/English speech/);
  });
}
