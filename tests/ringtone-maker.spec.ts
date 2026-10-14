// @webkit-project
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { patchBrand } from '../src/lib/m4r';

/** A mono 16-bit WAV of a tone, long enough to hit the ringtone cap. */
function tone(seconds: number, rate = 8000) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  return { name: 'song.wav', mimeType: 'audio/wav', buffer: buf };
}

const here = dirname(fileURLToPath(import.meta.url));
const mp3 = join(here, 'fixtures', 'static', 'song.mp3');

async function hasAac(page: Page) {
  return page.evaluate(() => AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }).then((r) => !!r.supported).catch(() => false));
}

test('patchBrand swaps only the major brand and refuses other data', () => {
  const src = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const out = patchBrand(src);
  expect(out.length).toBe(src.length);
  expect(Buffer.from(out.subarray(8, 12)).toString()).toBe('M4A ');
  expect([...out.subarray(0, 8)]).toEqual([...src.subarray(0, 8)]);
  expect([...out.subarray(12)]).toEqual([...src.subarray(12)]);
  expect(src[8]).toBe(0x69);
  expect(() => patchBrand(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toThrow();
});

test('ringtone maker opens set for an iPhone with a 30 second limit', async ({ page }) => {
  await page.goto('/ringtone-maker');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('input[name="rt-for"][value="iphone"]')).toBeChecked();
  await expect(page.locator('#fade-out')).toBeChecked();
  await expect(page.locator('#fade-in')).not.toBeChecked();
  if (await hasAac(page)) await expect(page.locator('#format')).toHaveValue('m4r');
  else {
    await expect(page.locator('#format')).toHaveValue('mp3');
    await expect(page.locator('#format-note')).toContainText('no AAC encoder');
  }
  await page.locator('#file-input').setInputFiles(tone(45));
  await expect(page.locator('#au-panel')).toBeVisible();
  await expect(page.locator('#au-end')).toHaveValue('29.5');
  await page.locator('#au-start').fill('5');
  await page.locator('#au-end').fill('44');
  await expect(page.locator('#au-end')).toHaveValue('34.5');
  await expect(page.locator('#au-estimate')).toContainText('30 seconds');
  await page.locator('input[name="rt-for"][value="android"]').check({ force: true }).catch(() => page.locator('label:has(input[value="android"])').click());
  await page.locator('#au-end').fill('44');
  await expect(page.locator('#au-end')).toHaveValue('44');
});

test('mp3-to-m4r and ringtone-maker have their own titles', async ({ page }) => {
  await page.goto('/mp3-to-m4r');
  await expect(page).toHaveTitle(/MP3 to M4R/);
  await expect(page.locator('#format')).toHaveValue(/m4r|mp3/);
  await page.goto('/mp3-cutter');
  await expect(page).not.toHaveTitle(/Ringtone/);
});

test('saves a .m4r that re-reads as AAC of the right length', async ({ page }) => {
  test.skip(!!process.env.CI, 'Linux CI Chromium has no AAC encoder');
  await page.goto('/ringtone-maker');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  test.skip(!(await hasAac(page)), 'this browser has no AAC encoder');
  await page.locator('#file-input').setInputFiles(mp3);
  await expect(page.locator('#au-panel')).toBeVisible();
  const full = Number(await page.locator('#au-panel').getAttribute('data-duration'));
  await expect(page.locator('#format')).toHaveValue('m4r');
  const dl = page.waitForEvent('download');
  await page.locator('#run').click();
  const download = await dl;
  expect(download.suggestedFilename()).toBe('song-ringtone.m4r');
  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(4, 8).toString()).toBe('ftyp');
  expect(bytes.subarray(8, 12).toString()).toBe('M4A ');
  expect(bytes.includes(Buffer.from('mp4a'))).toBe(true);
  const seconds = await page.evaluate(async (b) => {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(new Uint8Array(b).buffer);
    return { s: buf.duration, rate: buf.sampleRate };
  }, [...bytes]);
  test.info().annotations.push({ type: 'm4r', description: `${bytes.length} bytes, ${seconds.s.toFixed(3)} s of ${full} s, ${seconds.rate} Hz` });
  expect(Math.abs(seconds.s - Math.min(full, 29.5))).toBeLessThan(0.2);
  await expect(page.locator('#results-list .result-item')).toContainText('M4R');
});
