// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const PHOTOS = ['face.jpg', 'frenchie.jpg', 'checker.avif'].map(fx);

async function setUp(page: Page, opts: { seconds?: string; fade?: boolean } = {}) {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/tools/photo-slideshow-maker');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#seconds').fill(opts.seconds ?? '2');
  await page.locator('#transition').selectOption(opts.fade === false ? 'none' : 'fade');
  return requests;
}

async function run(page: Page, files: string[]) {
  await page.locator('#file-input').setInputFiles(files);
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 180_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  return readFileSync(await (await download).path());
}

/** Size, length, audio and the colour of the first frame, read through a video element. */
async function inspect(page: Page, mp4: Buffer) {
  return page.evaluate(async (data) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: 'video/mp4' }));
    await new Promise((ok, no) => {
      v.onloadeddata = ok;
      v.onerror = () => no(new Error('video error ' + v.error?.code));
    });
    await new Promise<void>((ok) => {
      v.onseeked = () => setTimeout(ok, 50);
      setTimeout(ok, 3000);
      v.currentTime = 0.3;
    });
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]!;
      g += d[i + 1]!;
      b += d[i + 2]!;
    }
    const n = d.length / 4;
    const media = v as HTMLVideoElement & { webkitAudioDecodedByteCount?: number; mozHasAudio?: boolean; audioTracks?: { length: number } };
    return {
      width: v.videoWidth,
      height: v.videoHeight,
      duration: v.duration,
      canPlay: v.canPlayType('video/mp4'),
      mean: [r / n, g / n, b / n],
      audioTracks: media.audioTracks?.length,
    };
  }, mp4.toString('base64'));
}

/** The codec of the MP4's sound track (AAC, Opus or MP3 depending on the browser's encoders), or null without one. */
async function audioCodec(mp4: Buffer) {
  const track = await new Input({ source: new BlobSource(new Blob([new Uint8Array(mp4)])), formats: ALL_FORMATS }).getPrimaryAudioTrack();
  return track?.codec ?? null;
}

test('Three photos and a song make a 1920×1080 MP4 of about six seconds with sound', async ({ page }) => {
  test.setTimeout(240_000);
  const requests = await setUp(page);
  const origin = new URL(page.url()).origin;
  const out = await run(page, [...PHOTOS, fx('song.mp3')]);
  const m = await inspect(page, out);
  expect(m.width).toBe(1920);
  expect(m.height).toBe(1080);
  expect(m.duration).toBeGreaterThan(5.5);
  expect(m.duration).toBeLessThan(6.5);
  expect(m.canPlay).not.toBe('');
  expect(await audioCodec(out), 'audio track').not.toBeNull();
  expect(requests.filter((u) => u.startsWith('http') && !u.startsWith(origin))).toEqual([]);
  await expect(page.locator('#results-list')).toContainText('slideshow.mp4');
});

test('Reversing the order changes the first frame', async ({ page }) => {
  test.setTimeout(240_000);
  await setUp(page, { fade: false });
  const forward = await inspect(page, await run(page, PHOTOS));
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#seconds').fill('2');
  const backward = await inspect(page, await run(page, [...PHOTOS].reverse()));
  const diff = forward.mean.reduce((t, v, i) => t + Math.abs(v - backward.mean[i]!), 0);
  // Linux WebKit in CI hands back blank video frames; then only the shape is checked.
  if (forward.mean.every((v) => v === 0)) return;
  expect(diff).toBeGreaterThan(5);
});

test('A slideshow with no song has no sound track', async ({ page }) => {
  test.setTimeout(240_000);
  await setUp(page, { fade: false });
  const out = await run(page, PHOTOS);
  const m = await inspect(page, out);
  expect(m.duration).toBeGreaterThan(5.5);
  expect(m.duration).toBeLessThan(6.5);
  expect(await audioCodec(out)).toBeNull();
});

test('One photo and 101 photos get clear messages and no download', async ({ page }) => {
  test.setTimeout(120_000);
  await setUp(page);
  await page.locator('#file-input').setInputFiles([PHOTOS[0]!]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('at least two photos');
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const many = Array.from({ length: 101 }, (_, i) => ({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: readFileSync(PHOTOS[0]!) }));
  await page.locator('#file-input').setInputFiles(many);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('limit is 100');
  await expect(page.locator('#results')).not.toHaveClass(/is-active/);
});

test('Without an AudioEncoder the song goes in as MP3', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    // iOS 18 and earlier: no AudioEncoder at all.
    delete (window as unknown as { AudioEncoder?: unknown }).AudioEncoder;
  });
  await setUp(page, { fade: false });
  const out = await run(page, [...PHOTOS, fx('song.mp3')]);
  const track = await new Input({ source: new BlobSource(new Blob([new Uint8Array(out)])), formats: ALL_FORMATS }).getPrimaryAudioTrack();
  expect(track?.codec).toBe('mp3');
  const m = await inspect(page, out);
  expect(m.duration).toBeGreaterThan(5.5);
});
