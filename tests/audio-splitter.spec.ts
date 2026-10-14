// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { wav } from './music-synth';

const dir = mkdtempSync(join(tmpdir(), 'audio-splitter-'));
const rehearsal = join(dir, 'rehearsal.wav');
const song = new URL('./fixtures/static/song.mp3', import.meta.url).pathname;
const SECONDS = 30;

test.beforeAll(() => {
  const tone = Float32Array.from({ length: 44100 * SECONDS }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / 44100));
  writeFileSync(rehearsal, wav(tone, 44100));
});

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.umami={track(){}};' }));
  await page.goto('/tools/audio-splitter');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

/** Sample frames in a 16-bit PCM WAV, read from its header. */
function frames(bytes: Uint8Array): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(40, true) / (dv.getUint16(22, true) * 2);
}

async function split(page: Page) {
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  return unzipSync(new Uint8Array(readFileSync((await zip.path())!)));
}

test('splits a WAV at typed times into abutting WAV parts, with Download all as a zip', async ({ page }) => {
  const errors = await open(page);
  await page.setInputFiles('#file-input', rehearsal);
  await expect(page.locator('#sp-info')).toContainText('0:30.0 long');
  await page.locator('#sp-times').fill('0:10, 0:20.5');
  await expect(page.locator('#sp-parts li')).toHaveCount(3);
  await page.locator('#format').selectOption('wav');
  const files = await split(page);
  expect(Object.keys(files).sort()).toEqual(['rehearsal-part-1.wav', 'rehearsal-part-2.wav', 'rehearsal-part-3.wav']);
  const counts = Object.keys(files).sort().map((n) => frames(files[n]!));
  expect(counts).toEqual([441000, 463050, 418950]);
  expect(counts.reduce((a, b) => a + b, 0)).toBe(44100 * SECONDS);
  expect(errors).toEqual([]);
});

test('splits a WAV every 3 seconds into ten zero-padded parts', async ({ page }) => {
  await open(page);
  await page.setInputFiles('#file-input', rehearsal);
  await page.locator('input[name="sp-mode"][value="every"]').check();
  await page.locator('#sp-unit').selectOption('1');
  await page.locator('#sp-every').fill('3');
  await expect(page.locator('#sp-parts li')).toHaveCount(10);
  await page.locator('#format').selectOption('wav');
  const files = await split(page);
  const names = Object.keys(files).sort();
  expect(names).toHaveLength(10);
  expect(names[0]).toBe('rehearsal-part-01.wav');
  expect(names[9]).toBe('rehearsal-part-10.wav');
  expect(names.reduce((sum, n) => sum + frames(files[n]!), 0)).toBe(44100 * SECONDS);
});

test('splits an MP3 into MP3 parts', async ({ page }) => {
  const errors = await open(page);
  await page.setInputFiles('#file-input', song);
  await expect(page.locator('#sp-info')).toContainText('long');
  await page.locator('#sp-times').fill('0.3, 0.6');
  await expect(page.locator('#sp-parts li')).toHaveCount(3);
  const files = await split(page);
  expect(Object.keys(files).sort()).toEqual(['song-part-1.mp3', 'song-part-2.mp3', 'song-part-3.mp3']);
  for (const bytes of Object.values(files)) expect(bytes.length).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test('says why the times cannot be used, and states the part cap', async ({ page }) => {
  await open(page);
  await page.setInputFiles('#file-input', rehearsal);
  await page.locator('#sp-times').fill('0:20, 0:10');
  await expect(page.locator('#sp-info')).toContainText('must go in order');
  await page.locator('#sp-times').fill('5:00');
  await expect(page.locator('#sp-info')).toContainText('is not inside the file');
  await page.locator('input[name="sp-mode"][value="every"]').check();
  await page.locator('#sp-unit').selectOption('1');
  await page.locator('#sp-every').fill('0.1');
  await expect(page.locator('#sp-info')).toContainText('at most 100 parts');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('at most 100 parts');
});
