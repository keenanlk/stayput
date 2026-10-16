// @webkit-project
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// /m4a-to-mp4 is the audio-to-video tool set up for M4A: a still picture held for the length of the sound.
const fx = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));

/** Opens the MP4 in a video element, which is what "plays" means for a browser. */
async function play(page: import('@playwright/test').Page, bytes: Buffer) {
  return page.evaluate(async (b64) => {
    const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'video/mp4' });
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(blob);
    await new Promise<void>((ok, bad) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => bad(new Error('the browser could not open the MP4'));
    });
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  }, bytes.toString('base64'));
}

async function convert(page: import('@playwright/test').Page, files: string[]) {
  await page.goto('/m4a-to-mp4');
  await expect(page).toHaveTitle('M4A to MP4: Turn an M4A into a Video, No Upload | Stayput');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(files);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', String(files.length));
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.locator('#run').click()]);
  return d;
}

test('an M4A and a picture become an MP4 that plays, as long as the sound', async ({ page }) => {
  const d = await convert(page, [fx('tone.m4a'), fx('logo-red.png')]);
  expect(d.suggestedFilename()).toBe('tone.mp4');
  const info = await play(page, readFileSync((await d.path())!));
  expect(info).toMatchObject({ width: 1920, height: 1080 });
  expect(info.duration).toBeGreaterThanOrEqual(1.5 - 0.2);
  expect(info.duration).toBeLessThan(1.5 + 0.2);
  await expect(page.locator('#results-list .result-item')).not.toContainText('title on plain background');
});

test('an M4A without a picture makes the title-card video', async ({ page }) => {
  const d = await convert(page, [fx('tone.m4a')]);
  expect(d.suggestedFilename()).toBe('tone.mp4');
  expect((await play(page, readFileSync((await d.path())!))).duration).toBeGreaterThan(1.2);
  await expect(page.locator('#results-list .result-item')).toContainText('title on plain background');
});

test('a copy-protected .m4p is refused with a clear message', async ({ page }) => {
  await page.goto('/m4a-to-mp4');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'song.m4p', mimeType: 'audio/mp4', buffer: Buffer.from('not readable') });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('copy-protected');
});

test('the page has its own copy and links the neighbouring converters', async ({ page }) => {
  await page.goto('/m4a-to-mp4');
  const prose = page.locator('.prose-wide');
  await expect(prose).toContainText('An M4A is an MP4 file that holds only sound');
  // The FAQ answer is folded away until opened, so check the links are in the page.
  for (const href of ['/mp3-to-mp4', '/m4a-to-mp3', '/tools/audio-to-video']) expect(await page.locator(`main a[href="${href}"]`).count(), href).toBeGreaterThan(0);
});
