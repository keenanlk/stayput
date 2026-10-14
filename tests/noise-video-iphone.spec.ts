// @webkit-project
import { test, expect, devices, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mp3FrameLength, splitMp3Frames } from '../src/lib/mp3-frames';

// Remove background noise from a video on an iPhone profile. iOS 18 and earlier have no AudioEncoder
// (in any browser on the phone), so the new sound has to be written as MP3 in the MP4 instead of
// failing with a bare Error. WebKit only: CI's Chromium cannot decode AAC.
const mov = fileURLToPath(new URL('./fixtures/static/speech.mov', import.meta.url));
const silent = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
});

test.use({ ...devices['iPhone 15'], browserName: 'webkit' });

async function noAudioEncoder(page: Page) {
  await page.addInitScript(() => {
    // What iOS 18 and earlier offer: video encoding, no audio encoding or decoding.
    for (const k of ['AudioEncoder', 'AudioDecoder']) Object.defineProperty(window, k, { value: undefined, configurable: true });
  });
}

async function open(page: Page) {
  await page.goto('/remove-background-noise-from-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

test('on an iPhone with no audio encoder, noise removal still finishes with a download that has sound', async ({ page }) => {
  test.setTimeout(150_000);
  await noAudioEncoder(page);
  await open(page);
  expect(await page.evaluate(() => typeof AudioEncoder)).toBe('undefined');
  const download = page.waitForEvent('download');
  await page.locator('#file-input').setInputFiles(mov);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const d = await download;
  expect(d.suggestedFilename()).toBe('speech-clean.mp4');
  const bytes = readFileSync((await d.path())!);
  // The sound track is MP3 (esds object type 0x6B) and the file plays back at the clip's length.
  const text = Buffer.from(bytes).toString('latin1');
  const esds = text.indexOf('esds');
  expect(text.indexOf('mp4a')).toBeGreaterThan(0);
  expect(esds).toBeGreaterThan(0);
  expect(bytes.subarray(esds, esds + 40).includes(0x6b)).toBe(true);
  const duration = await page.evaluate(
    (data) =>
      new Promise<number>((resolve, reject) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => resolve(v.duration);
        v.onerror = () => reject(new Error('cannot play'));
        v.src = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'video/mp4' }));
      }),
    [...bytes],
  );
  expect(duration).toBeGreaterThan(15);
  expect(duration).toBeLessThan(18);
});

test('a video with no sound track says so', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await page.locator('#file-input').setInputFiles(silent);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText('has no sound to clean');
});

test('if the MP3 encoder cannot load, the page says the sound encoder could not load', async ({ page }) => {
  test.setTimeout(90_000);
  await noAudioEncoder(page);
  await page.route('**/vendor/wasm-media-encoders*/**', (r) => r.abort());
  await open(page);
  await page.locator('#file-input').setInputFiles(mov);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText('The sound encoder could not load');
});

test('MP3 frames are split on whole frame boundaries', () => {
  // 48 kHz, 192 kbps MPEG-1 Layer III: 576 bytes, 577 with the padding bit.
  const frame = (pad: number) => {
    const f = new Uint8Array(576 + pad);
    f.set([0xff, 0xfb, 0xb4 | (pad << 1), 0x00]);
    return f;
  };
  expect(mp3FrameLength(frame(0), 0)).toBe(576);
  expect(mp3FrameLength(frame(1), 0)).toBe(577);
  expect(mp3FrameLength(new Uint8Array(8), 0)).toBe(0);
  const joined = new Uint8Array(576 + 577 + 100);
  joined.set(frame(0), 0);
  joined.set(frame(1), 576);
  joined.set([0xff, 0xfb, 0xb4, 0x00], 576 + 577);
  const { frames, rest } = splitMp3Frames(joined);
  expect(frames.map((f) => f.length)).toEqual([576, 577]);
  expect(rest.length).toBe(100);
});
