// @webkit-project
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SONG = fileURLToPath(new URL('./fixtures/static/song.mp3', import.meta.url));

test('MP3 to AAC writes an .m4a that decodes and has the same length', async ({ page }) => {
  await page.route('https://stats.keenankaufman.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/mp3-to-aac');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#format')).toHaveValue('m4a');

  // Chromium on Linux CI has no AAC encoder; the page says so instead, which the tools spec covers.
  const aac = await page.evaluate(() => AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 }).then((r) => !!r.supported));
  test.skip(!aac, 'this browser has no AAC encoder');

  await page.locator('#file-input').setInputFiles(SONG);
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('song.m4a');
  const bytes = readFileSync((await file.path())!);
  expect(bytes.toString('latin1', 4, 8)).toBe('ftyp');
  expect(bytes.includes(Buffer.from('mp4a'))).toBe(true);

  const b64 = (b: Buffer) => b.toString('base64');
  const secondsOf = (data: string) => page.evaluate(async (s) => {
    const raw = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const buf = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(raw.buffer);
    return buf.duration;
  }, data);
  const before = await secondsOf(b64(readFileSync(SONG)));
  const after = await secondsOf(b64(bytes));
  expect(after).toBeGreaterThan(0);
  expect(Math.abs(after - before)).toBeLessThan(0.15);
});
