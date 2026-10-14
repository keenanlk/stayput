// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

// Video to MOV writes a QuickTime file (ftyp 'qt  ') that holds H.264 video and AAC sound only.
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
// H.264 + AAC MP4, 4 s.
const mp4 = fixture('tone-16k-mono.mp4');
// VP8 + Opus WebM: both have to be re-encoded, to H.264 and AAC.
const webm = fixture('talk.webm');
// An iPhone-style .mov (rotated H.264, stereo AAC).
const phoneMov = fixture('iphone-portrait.mov');

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

async function convert(page: Page, file: string): Promise<{ bytes: Buffer; name: string; note: string }> {
  await page.locator('#file-input').setInputFiles([file]);
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const d = await download;
  const note = await page.locator('#results').innerText();
  return { bytes: readFileSync(await d.path()), name: d.suggestedFilename(), note };
}

/** The file is QuickTime (major brand 'qt  ') with one H.264 and one AAC track. */
async function expectQuickTime(bytes: Buffer) {
  expect(bytes.subarray(4, 12).toString('latin1')).toBe('ftypqt  ');
  const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(bytes)])), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  expect(video?.codec).toBe('avc');
  expect(audio?.codec).toBe('aac');
  return { video: video!, audio: audio!, duration: await input.computeDuration() };
}

test('Video to MOV copies an H.264/AAC MP4 into a QuickTime .mov', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, '/tools/video-to-mov');
  const r = await convert(page, mp4);
  expect(r.name).toBe('tone-16k-mono.mov');
  expect(r.note).toContain('H.264 copied, no quality loss');
  const q = await expectQuickTime(r.bytes);
  expect(q.video.displayWidth).toBe(320);
  expect(q.duration).toBeGreaterThan(3.5);
});

test('MP4 to MOV preset converts a WebM (VP8, Opus) to H.264 and AAC in a QuickTime .mov', async ({ page, browserName }) => {
  // Chromium's AAC encoder is missing in some Linux builds; the page then refuses with a message (see the next test).
  test.setTimeout(240_000);
  await open(page, '/mp4-to-mov');
  await expect(page.locator('#tool')).toHaveAttribute('data-base', 'video-to-mov');
  await page.locator('#file-input').setInputFiles([webm]);
  const download = page.waitForEvent('download', { timeout: 150_000 }).catch(() => null);
  await page.locator('#run').click();
  const done = page.locator('#results.is-active');
  const failed = page.locator('#error.is-active');
  await expect(done.or(failed)).toBeVisible({ timeout: 150_000 });
  if (await failed.isVisible()) test.skip(true, `${browserName} cannot write H.264 and AAC here: ${await failed.innerText()}`);
  const d = await download;
  expect(d).not.toBeNull();
  const bytes = readFileSync(await d!.path());
  expect(d!.suggestedFilename()).toBe('talk.mov');
  await expectQuickTime(bytes);
});

test('Video to MOV takes an iPhone-style .mov and keeps the picture and sound', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, '/tools/video-to-mov');
  const r = await convert(page, phoneMov);
  const q = await expectQuickTime(r.bytes);
  expect(q.video.displayWidth).toBe(720);
  expect(q.video.displayHeight).toBe(1280);
});

test('Unsupported input gets a plain message, not a broken file', async ({ page }) => {
  await open(page, '/tools/video-to-mov');
  await page.locator('#file-input').setInputFiles([{ name: 'not-video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('this is not a video') }]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
});

test('AAC sound is copied, not decoded: a browser with no AAC decoder still keeps the sound track', async ({ page }) => {
  // Chromium on Linux cannot decode AAC in the page; asking for a bitrate made the sound go through a decoder and vanish.
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const real = AudioDecoder.isConfigSupported.bind(AudioDecoder);
    AudioDecoder.isConfigSupported = async (config) => (/^mp4a/.test(config.codec) ? { supported: false, config } : real(config));
  });
  await open(page, '/tools/video-to-mov');
  const r = await convert(page, mp4);
  await expectQuickTime(r.bytes);
});
