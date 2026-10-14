// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { MAX_VIDEO_PARTS, planAtTimes, planEqual, planEvery, videoPartName } from '../src/lib/video-split';

const clip = new URL('./fixtures/static/split-60s.mp4', import.meta.url).pathname;

// Plain planning, no browser needed.

test('times, every-N and equal parts all cover the video end to end', () => {
  for (const parts of [planAtTimes('1:30, 4:00', 600), planEvery(20, 60), planEvery(45, 100), planEqual(7, 100)]) {
    expect(parts[0]!.start).toBe(0);
    for (let i = 1; i < parts.length; i++) expect(parts[i]!.start).toBe(parts[i - 1]!.end);
  }
  expect(planAtTimes('1:30, 4:00', 600).map((p) => [p.start, p.end])).toEqual([[0, 90], [90, 240], [240, 600]]);
  expect(planEvery(20, 60)).toHaveLength(3);
  expect(planEvery(45, 100).map((p) => p.end)).toEqual([45, 90, 100]);
  expect(planEqual(4, 100).map((p) => p.end)).toEqual([25, 50, 75, 100]);
});

test('bad plans say what to fix', () => {
  expect(() => planAtTimes('', 60)).toThrow(/at least one time/);
  expect(() => planAtTimes('2:00', 60)).toThrow(/not inside the video, which is 1:00 long/);
  expect(() => planAtTimes('0:30, 0:10', 60)).toThrow(/in order/);
  expect(() => planAtTimes('0:10, 0:10', 60)).toThrow(/twice/);
  expect(() => planAtTimes('soon', 60)).toThrow(/not a time/);
  expect(() => planEvery(0, 60)).toThrow(/greater than zero/);
  expect(() => planEvery(60, 60)).toThrow(/nothing to split/);
  expect(() => planEqual(1, 60)).toThrow(/2 or more/);
});

test('the 50-part cap holds for every mode', () => {
  expect(planEqual(MAX_VIDEO_PARTS, 100)).toHaveLength(50);
  expect(() => planEqual(51, 100)).toThrow(/51 parts.*at most 50/);
  expect(() => planEvery(1, 100)).toThrow(/100 parts.*at most 50/);
  expect(planEvery(2, 100)).toHaveLength(50);
  expect(() => planAtTimes(Array.from({ length: 50 }, (_, i) => i + 1).join(','), 100)).toThrow(/51 parts/);
});

test('part names are zero-padded and sort', () => {
  expect(videoPartName('holiday.mov', 0, 3, 'mov')).toBe('holiday-part-01.mov');
  expect(videoPartName('holiday.mov', 11, 12, 'mp4')).toBe('holiday-part-12.mp4');
});

// The page.

async function open(page: Page, path = '/tools/video-splitter') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    // Count the video encoders the page makes: a fast cut must make none.
    const w = window as unknown as { __encoders: number; VideoEncoder?: typeof VideoEncoder };
    w.__encoders = 0;
    const Real = w.VideoEncoder;
    if (Real) {
      w.VideoEncoder = class extends Real {
        constructor(init: VideoEncoderInit) {
          super(init);
          w.__encoders++;
        }
      } as typeof VideoEncoder;
    }
  });
  await page.route('https://stats.keenankaufman.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }));
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

/** The picture's length and the whole file's length (the sound can run on a frame or two past the picture). */
async function durationsOf(bytes: Uint8Array): Promise<{ video: number; file: number }> {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const video = await (await input.getPrimaryVideoTrack())!.computeDuration();
  return { video, file: await input.computeDuration() };
}

async function run(page: Page) {
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 180_000 });
  const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  return unzipSync(new Uint8Array(readFileSync((await zip.path())!)));
}

async function everyTwenty(page: Page) {
  await page.setInputFiles('#file-input', clip);
  await expect(page.locator('#vs-info')).toContainText('1:00.0 long');
  await page.locator('input[name="vs-mode"][value="every"]').check();
  await page.locator('#vs-every').fill('20');
  await expect(page.locator('#vs-parts li')).toHaveCount(3);
  await expect(page.locator('#vs-info')).toContainText('3 parts, about');
}

test('fast mode splits a 60 s clip every 20 s into three parts without re-encoding', async ({ page }) => {
  const errors = await open(page);
  const hosts: string[] = [];
  page.on('request', (r) => hosts.push(new URL(r.url()).host));
  await everyTwenty(page);
  const started = Date.now();
  const files = await run(page);
  const took = Date.now() - started;
  const names = Object.keys(files).sort();
  expect(names).toEqual(['split-60s-part-01.mp4', 'split-60s-part-02.mp4', 'split-60s-part-03.mp4']);
  let sum = 0;
  for (const n of names) sum += (await durationsOf(files[n]!)).file;
  expect(Math.abs(sum - 60)).toBeLessThan(1);
  expect(await page.evaluate(() => (window as unknown as { __encoders: number }).__encoders)).toBe(0);
  expect(took).toBeLessThan(30_000);
  // No file or part name reaches analytics.
  const events = JSON.stringify(await page.evaluate(() => (window as unknown as { __events: unknown[] }).__events));
  expect(events).toContain('tool_run');
  expect(events).not.toContain('split-60s');
  expect(events).not.toContain('part-0');
  // Nothing but the page's own origin (and the analytics host, stubbed) was asked for.
  const own = new URL(page.url()).host;
  expect(hosts.filter((h) => h !== own && h !== 'stats.keenankaufman.com')).toEqual([]);
  expect(errors).toEqual([]);
});

test('exact mode re-encodes and the pictures add up to the source within 0.1 s', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux WebKit in CI stalls decoding and encoding video; macOS WebKit runs it locally with PW_WEBKIT=1');
  test.setTimeout(240_000);
  const errors = await open(page);
  await everyTwenty(page);
  await page.locator('#exact').check();
  await page.locator('#run').click();
  await page.locator('#results.is-active, #error.is-active').first().waitFor({ timeout: 200_000 });
  const failed = page.locator('#error.is-active');
  if (await failed.isVisible()) test.skip(true, `${browserName} cannot re-encode H.264 here: ${await failed.innerText()}`);
  const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  const files = unzipSync(new Uint8Array(readFileSync((await zip.path())!)));
  const names = Object.keys(files).sort();
  expect(names).toHaveLength(3);
  // The picture of each part is exactly 20 s. The browser's AAC encoder pads the sound's end by up to two frames
  // (about 75 ms), so the file as a whole runs a hair over: each part stays within 0.1 s of its plan.
  let video = 0;
  for (const n of names) {
    const d = await durationsOf(files[n]!);
    expect(Math.abs(d.file - 20)).toBeLessThan(0.1);
    video += d.video;
  }
  expect(Math.abs(video - 60)).toBeLessThan(0.1);
  expect(await page.evaluate(() => (window as unknown as { __encoders: number }).__encoders)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('times and equal parts work, a time past the end is refused, and the part count shows before the run', async ({ page }) => {
  await open(page, '/split-video');
  await page.setInputFiles('#file-input', clip);
  await expect(page.locator('#vs-info')).toContainText('1:00.0 long');
  await page.locator('#vs-times').fill('0:10, 0:25');
  await expect(page.locator('#vs-info')).toContainText('3 parts');
  await expect(page.locator('#vs-parts li')).toHaveCount(3);
  await page.locator('#vs-times').fill('0:10, 2:00');
  await expect(page.locator('#vs-info')).toContainText('2:00 is not inside the video, which is 1:00 long');
  await expect(page.locator('#vs-parts')).toBeHidden();
  await page.locator('input[name="vs-mode"][value="equal"]').check();
  await page.locator('#vs-equal').fill('4');
  await expect(page.locator('#vs-parts li')).toHaveCount(4);
  await page.locator('#vs-equal').fill('51');
  await expect(page.locator('#vs-info')).toContainText('at most 50');
  await page.locator('#vs-equal').fill('2');
  const files = await run(page);
  expect(Object.keys(files).sort()).toEqual(['split-60s-part-01.mp4', 'split-60s-part-02.mp4']);
});

test('the pages link the other video tools and say the video is not uploaded', async ({ page }) => {
  await open(page);
  const html = await page.content();
  for (const href of ['/cut-video', '/trim-mp4', '/combine-videos']) expect(html).toContain(`href="${href}"`);
  await expect(page).toHaveTitle('Video Splitter: Cut a Video into Parts, No Upload | Stayput');
  await expect(page.locator('h1')).toHaveText('Split a video into parts');
  expect(html).toContain('cut one video into parts');
  expect(html).not.toMatch(/side by side|split screen/i);
});
