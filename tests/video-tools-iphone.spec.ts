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
