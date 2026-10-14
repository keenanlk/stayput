// @webkit-project
import { test, expect, devices, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

// Video tools on an iPhone profile with no audio encoder or decoder (iOS 18 and earlier, in every browser
// there). A clip with sound must still come out as a playable MP4 with a sound track, which is MP3 when
// the sound had to be written anew. WebKit only: CI's Chromium cannot decode AAC.
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const speech = fixture('speech.mov');
const talk = fixture('talk.webm');

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
});

test.use({ ...devices['iPhone 15'], browserName: 'webkit' });

async function noAudioCodecs(page: Page) {
  await page.addInitScript(() => {
    for (const k of ['AudioEncoder', 'AudioDecoder']) Object.defineProperty(window, k, { value: undefined, configurable: true });
  });
}

async function sourceDuration(file: string) {
  const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(readFileSync(file))])), formats: ALL_FORMATS });
  return input.computeDuration();
}

const tools: { name: string; path: string; files: string[]; factor: number; ext: string; codec: string }[] = [
  // codec: MP3 where the sound is written anew; AAC where the clips' own packets are copied.
  { name: 'video-speed', path: '/tools/video-speed', files: [speech], factor: 0.5, ext: 'mp4', codec: 'mp3' }, // 2x is the default
  { name: 'merge-videos', path: '/tools/merge-videos', files: [speech, speech], factor: 1, ext: 'mp4', codec: 'aac' },
  // AAC and Opus cannot be copied into one track, so the joined sound is written as MP3.
  { name: 'merge-videos (mixed sound)', path: '/tools/merge-videos', files: [speech, talk], factor: 1, ext: 'mp4', codec: 'mp3' },
  { name: 'reverse-video', path: '/tools/reverse-video', files: [speech], factor: 1, ext: 'mp4', codec: 'mp3' },
  { name: 'compress-video', path: '/tools/compress-video', files: [speech], factor: 1, ext: 'mp4', codec: 'aac' },
  // The Opus sound is decoded by the page's own audio decoder: Linux WebKit (CI) has none for Opus, so this one runs on a Mac only.
  { name: 'video-to-mp4 (WebM, Opus sound)', path: '/tools/video-to-mp4', files: [talk], factor: 1, ext: 'mp4', codec: 'mp3' },
];

for (const t of tools) {
  test(`${t.name} finishes a clip with sound when the browser has no audio encoder`, async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!!process.env.CI && t.name.startsWith('video-to-mp4'), 'Linux WebKit cannot decode Opus');
    await noAudioCodecs(page);
    await page.goto(t.path);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    expect(await page.evaluate(() => typeof AudioEncoder)).toBe('undefined');
    await page.locator('#file-input').setInputFiles(t.files);
    const download = page.waitForEvent('download', { timeout: 200_000 });
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    const d = await download;
    expect(d.suggestedFilename()).toMatch(new RegExp(`\\.${t.ext}$`));
    const bytes = readFileSync((await d.path())!);

    const out = new Input({ source: new BlobSource(new Blob([new Uint8Array(bytes)])), formats: ALL_FORMATS });
    const audio = await out.getPrimaryAudioTrack();
    expect(audio, 'the download has a sound track').not.toBeNull();
    expect(audio!.codec).toBe(t.codec);
    const lengths = await Promise.all(t.files.map(sourceDuration));
    const expected = lengths.reduce((a, b) => a + b, 0) * t.factor;
    const duration = await out.computeDuration();
    expect(duration).toBeGreaterThan(expected * 0.9);
    expect(duration).toBeLessThan(expected * 1.1);

    // The page can play the file and reports its length. Only MP3 is checked this way: Linux WebKit on CI
    // never answers for AAC in an MP4 (the copied sound), and the length above comes from the file itself.
    if (t.codec !== 'mp3') return;
    const played = await page.evaluate(
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
    expect(played).toBeGreaterThan(expected * 0.9);
    expect(played).toBeLessThan(expected * 1.1);
  });
}

const song = fixture('song.mp3');
const face = fixture('face.jpg');

/** The page plays the MP4 and reports its length (MP3 sound only: Linux WebKit never answers for AAC in an MP4). */
async function playedLength(page: Page, bytes: Buffer, type: string) {
  return page.evaluate(
    (data) =>
      new Promise<number>((resolve, reject) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => resolve(v.duration);
        v.onerror = () => reject(new Error('cannot play'));
        v.src = URL.createObjectURL(new Blob([new Uint8Array(data.bytes)], { type: data.type }));
      }),
    { bytes: [...bytes], type },
  );
}

test('audio-to-video writes the sound as MP3 when the browser has no audio encoder', async ({ page }) => {
  test.setTimeout(240_000);
  await noAudioCodecs(page);
  await page.goto('/tools/audio-to-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([song, face]);
  const download = page.waitForEvent('download', { timeout: 200_000 });
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const bytes = readFileSync((await (await download).path())!);
  const out = new Input({ source: new BlobSource(new Blob([new Uint8Array(bytes)])), formats: ALL_FORMATS });
  const audio = await out.getPrimaryAudioTrack();
  expect(audio, 'the download has a sound track').not.toBeNull();
  expect(audio!.codec).toBe('mp3');
  const expected = await sourceDuration(song);
  const duration = await out.computeDuration();
  expect(duration).toBeGreaterThan(expected * 0.9);
  expect(duration).toBeLessThan(expected * 1.1);
  const played = await playedLength(page, bytes, 'video/mp4');
  expect(played).toBeGreaterThan(expected * 0.9);
  expect(played).toBeLessThan(expected * 1.1);
});

// speech.mov (AAC) cannot be re-encoded here, so exact mode copies its sound: the cut is still exact on the picture.
for (const exact of [true, false]) {
  test(`trim-video ${exact ? 'exact' : 'fast'} keeps the sound when the browser has no audio encoder`, async ({ page }) => {
    test.setTimeout(240_000);
    await noAudioCodecs(page);
    await page.goto('/tools/trim-video');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(speech);
    await expect(page.locator('#vg-panel[data-duration]')).toBeVisible({ timeout: 60_000 });
    const length = await sourceDuration(speech);
    // Fast mode starts at 0, a key frame: a start between key frames re-encodes the head of the clip, which stalls
    // in Playwright's WebKit with or without audio codecs (the same on main), and is not what this test is about.
    const start = exact ? 1 : 0;
    const end = Math.min(length, 4);
    await page.locator('#vg-start').fill(String(start));
    await page.locator('#vg-end').fill(String(end));
    if (exact) await page.locator('#exact').check();
    const download = page.waitForEvent('download', { timeout: 200_000 });
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/\.mov$/);
    const out = new Input({ source: new BlobSource(new Blob([new Uint8Array(readFileSync((await d.path())!))])), formats: ALL_FORMATS });
    const audio = await out.getPrimaryAudioTrack();
    expect(audio, 'the download has a sound track').not.toBeNull();
    expect(audio!.codec).toBe('aac');
    expect(await out.getPrimaryVideoTrack()).not.toBeNull();
    const duration = await out.computeDuration();
    const expected = end - start;
    expect(duration).toBeGreaterThan(expected * 0.9);
    expect(duration).toBeLessThan(expected * 1.1 + (exact ? 0 : 0.5));
  });
}

test('trim-video exact copies an Opus WebM\'s sound when the browser has no audio encoder', async ({ page }) => {
  test.setTimeout(240_000);
  await noAudioCodecs(page);
  await page.goto('/tools/trim-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(talk);
  await expect(page.locator('#vg-panel[data-duration]')).toBeVisible({ timeout: 60_000 });
  const length = await sourceDuration(talk);
  const end = Math.min(length, 3);
  await page.locator('#vg-start').fill('1');
  await page.locator('#vg-end').fill(String(end));
  await page.locator('#exact').check();
  const download = page.waitForEvent('download', { timeout: 200_000 });
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const out = new Input({ source: new BlobSource(new Blob([new Uint8Array(readFileSync((await (await download).path())!))])), formats: ALL_FORMATS });
  expect((await out.getPrimaryAudioTrack())?.codec).toBe('opus');
  const duration = await out.computeDuration();
  expect(duration).toBeGreaterThan((end - 1) * 0.9);
  expect(duration).toBeLessThan((end - 1) * 1.1);
});

test('if the MP3 encoder cannot load, the page says the sound encoder could not load', async ({ page }) => {
  test.setTimeout(90_000);
  await noAudioCodecs(page);
  await page.route('**/vendor/wasm-media-encoders*/**', (r) => r.abort());
  await page.goto('/tools/video-speed');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(speech);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText('The sound encoder could not load');
});
