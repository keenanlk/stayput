// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

// Video to WebM writes VP9 (or VP8) video and Opus sound. A browser that cannot encode them says so and writes nothing.
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
// H.264 + AAC MP4, 4 s, 320 wide.
const mp4 = fixture('tone-16k-mono.mp4');

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

type Outcome = { bytes: Buffer; name: string; note: string } | { error: string };

async function convert(page: Page, file: string, mute = false): Promise<Outcome> {
  await page.locator('#file-input').setInputFiles([file]);
  if (mute) await page.locator('#mute').check();
  const download = page.waitForEvent('download', { timeout: 150_000 }).catch(() => null);
  await page.locator('#run').click();
  const done = page.locator('#results.is-active');
  const failed = page.locator('#error.is-active');
  await expect(done.or(failed)).toBeVisible({ timeout: 150_000 });
  if (await failed.isVisible()) return { error: await failed.innerText() };
  const d = (await download)!;
  return { bytes: readFileSync(await d.path()), name: d.suggestedFilename(), note: await page.locator('#results').innerText() };
}

async function read(bytes: Buffer) {
  const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(bytes)])), formats: ALL_FORMATS });
  expect((await input.getFormat()).name).toBe('WebM');
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  return { video: video!, audio, duration: await input.computeDuration() };
}

function expectCleanRefusal(r: { error: string }, browserName: string) {
  // The can't-encode message names a browser to use rather than failing silently.
  expect(r.error, `${browserName} refusal`).toMatch(/cannot write WebM|cannot convert this file’s sound to Opus|cannot convert this video/);
  expect(r.error).toMatch(/Chrome|Edge|Firefox/);
}

test('Video to WebM re-encodes an H.264/AAC MP4 to VP9 or VP8 with Opus sound', async ({ page, browserName }) => {
  test.setTimeout(240_000);
  // Linux WebKit in CI stalls silently decoding video in the page; macOS WebKit writes VP9 and Opus.
  test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux WebKit video decode stalls in CI');
  await open(page, '/tools/video-to-webm');
  const r = await convert(page, mp4);
  if ('error' in r) return expectCleanRefusal(r, browserName);
  expect(r.name).toBe('tone-16k-mono.webm');
  const w = await read(r.bytes);
  expect(['vp8', 'vp9']).toContain(w.video.codec);
  expect(w.audio?.codec).toBe('opus');
  expect(w.video.displayWidth).toBe(320);
  expect(Math.abs(w.duration - 4)).toBeLessThan(0.2);
});

test('MP4 to WebM preset converts without the sound when asked', async ({ page, browserName }) => {
  test.setTimeout(240_000);
  test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux WebKit video decode stalls in CI');
  await open(page, '/mp4-to-webm');
  await expect(page.locator('#tool')).toHaveAttribute('data-base', 'video-to-webm');
  const r = await convert(page, mp4, true);
  if ('error' in r) return expectCleanRefusal(r, browserName);
  const w = await read(r.bytes);
  expect(['vp8', 'vp9']).toContain(w.video.codec);
  expect(w.audio).toBeNull();
  expect(r.note).toContain('no sound');
});
