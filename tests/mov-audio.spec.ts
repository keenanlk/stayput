import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// iPhone camera files are QuickTime .mov, which Safari's decodeAudioData refuses whole. The sound must
// still come out (Video to MP3) or be kept (Merge videos), or the page must say it was left out.
// CI's Chromium cannot decode AAC, so this runs in the webkit project only.
const mov = fileURLToPath(new URL('./fixtures/static/speech.mov', import.meta.url));

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
});

test('Video to MP3 gives an MP3 with sound from a QuickTime .mov', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, '/tools/video-to-mp3');
  const download = page.waitForEvent('download');
  await page.locator('#file-input').setInputFiles(mov);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const bytes = readFileSync((await (await download).path())!);
  // The MP3 reads back with the sound track's length (11 s) and is not silence.
  const { duration, peak } = await page.evaluate(async (data) => {
    const ctx = new OfflineAudioContext(2, 1, 44100);
    const buffer = await ctx.decodeAudioData(new Uint8Array(data).buffer);
    let peak = 0;
    for (const v of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
    return { duration: buffer.duration, peak };
  }, [...bytes]);
  expect(Math.abs(duration - 11)).toBeLessThan(0.3);
  expect(peak).toBeGreaterThan(0.01);
});

test('Merge videos keeps the sound of two .mov clips, with no note about it being left out', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, '/tools/merge-videos');
  await page.locator('#file-input').setInputFiles([
    { name: 'a.mov', mimeType: 'video/quicktime', buffer: readFileSync(mov) },
    { name: 'b.mov', mimeType: 'video/quicktime', buffer: readFileSync(mov) },
  ]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  const note = (await page.locator('#results-list').innerText()).toLowerCase();
  expect(note).not.toContain('no sound');
  expect(note).not.toContain('left out');
});
