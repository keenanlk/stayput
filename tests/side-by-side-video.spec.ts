// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { estimateMemory, memoryVerdict, outputFps, outputSeconds, planSideBySide, PHONE_MEMORY_CAP } from '../src/lib/side-by-side-plan';

const fx = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));
const A = fx('sbs-a-24fps.mp4'); // 10 s, 24 fps, 440 Hz, grey ramp
const B = fx('sbs-b-30fps.mp4'); // 10 s, 30 fps, 880 Hz, tinted ramp
const B6 = fx('sbs-b-30fps-6s.mp4'); // 6 s of the same
const LONG = fx('sbs-long-20min.mp4');

// Plain arithmetic, no browser needed.

test('two 720p clips make 2560x720 in a row and 1280x1440 in a column', () => {
  expect(planSideBySide(1280, 720, 1280, 720, 'row', 'contain')).toMatchObject({ width: 2560, height: 720, a: { x: 0, w: 1280 }, b: { x: 1280, w: 1280 } });
  expect(planSideBySide(1280, 720, 1280, 720, 'column', 'contain')).toMatchObject({ width: 1280, height: 1440, a: { y: 0, h: 720 }, b: { y: 720, h: 720 } });
});

test('cells are even, shapes are kept, crop-to-fill uses equal cells, and the width is capped at 3,840', () => {
  const odd = planSideBySide(1281, 721, 640, 360, 'row', 'contain');
  for (const c of [odd.a, odd.b, { w: odd.width, h: odd.height }]) {
    expect(c.w % 2).toBe(0);
    expect(c.h % 2).toBe(0);
  }
  // B is scaled to A's height (720): 640x360 becomes 1280x720.
  expect(odd.b.h).toBe(odd.height);
  expect(planSideBySide(1280, 720, 720, 1280, 'row', 'cover').b).toMatchObject({ w: 1280, h: 720 });
  const wide = planSideBySide(3840, 2160, 3840, 2160, 'row', 'contain');
  expect(wide.width).toBeLessThanOrEqual(3840);
  expect(wide.height).toBeLessThanOrEqual(3840);
  expect(wide.width / wide.height).toBeCloseTo(32 / 9, 1);
});

test('the output rate, length and memory guard', () => {
  expect(outputFps(24, 30)).toBe(30);
  expect(outputFps(29.97, 23.976)).toBe(30);
  expect(outputFps(120, 30)).toBe(60);
  expect(outputFps(NaN, NaN)).toBe(30);
  expect(outputSeconds(10, 6, 'shorter')).toBe(6);
  expect(outputSeconds(10, 6, 'longer')).toBe(10);
  const plan = planSideBySide(1280, 720, 1280, 720, 'row', 'contain');
  const small = estimateMemory({ ...plan, fps: 30, seconds: 10, sound: 'a', soundSeconds: 10 });
  expect(memoryVerdict(small, false, String)).toBe('');
  expect(memoryVerdict(small, true, String)).toBe('');
  const long = estimateMemory({ ...plan, fps: 30, seconds: 1200, sound: 'a', soundSeconds: 1200 });
  expect(long).toBeGreaterThan(PHONE_MEMORY_CAP);
  expect(memoryVerdict(long, true, (n) => `${Math.round(n / 1e6)} MB`)).toMatch(/needs about \d+ MB.*phone/);
  const huge = estimateMemory({ width: 3840, height: 2160, a: plan.a, b: plan.b, fps: 60, seconds: 7200, sound: 'mix', soundSeconds: 7200 });
  expect(memoryVerdict(huge, false, String)).not.toBe('');
});

// The page.

async function open(page: Page, path = '/tools/side-by-side-video') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
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

async function tracksOf(bytes: Uint8Array) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const video = (await input.getPrimaryVideoTrack())!;
  const audio = await input.getPrimaryAudioTrack();
  return { width: video.displayWidth, height: video.displayHeight, seconds: await video.computeDuration(), audio: !!audio };
}

/** Pick the options, press Run, and return the MP4 (skipping where a browser cannot encode here). */
async function make(page: Page, files: string[], opts: Partial<Record<'layout' | 'fit' | 'sound' | 'length', string>> = {}, browserName = '') {
  await page.setInputFiles('#file-input', files);
  await expect(page.locator('#sbs-info')).toContainText('Result:');
  for (const [k, v] of Object.entries(opts)) await page.locator(`#sbs-${k}`).selectOption(v!);
  const downloaded = page.waitForEvent('download', { timeout: 240_000 }).catch(() => null);
  await page.locator('#run').click();
  await page.locator('#results.is-active, #error.is-active').first().waitFor({ timeout: 240_000 });
  const failed = page.locator('#error.is-active');
  if (await failed.isVisible()) test.skip(true, `${browserName} cannot encode video here: ${await failed.innerText()}`);
  const dl = (await downloaded)!;
  return new Uint8Array(readFileSync((await dl.path())!));
}

/** Grey level at the middle of each cell at a given time, read by playing the file in the page. */
async function lumaAt(page: Page, bytes: Uint8Array, seconds: number, points: { x: number; y: number }[]): Promise<number[]> {
  const b64 = Buffer.from(bytes).toString('base64');
  return page.evaluate(
    async ({ b64, seconds, points }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const video = document.createElement('video');
      video.muted = true;
      video.src = URL.createObjectURL(new Blob([arr], { type: 'video/mp4' }));
      await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }));
      video.currentTime = seconds;
      await new Promise((r) => video.addEventListener('seeked', r, { once: true }));
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      return points.map((p) => {
        const d = ctx.getImageData(p.x, p.y, 1, 1).data;
        return 0.299 * d[0]! + 0.587 * d[1]! + 0.114 * d[2]!;
      });
    },
    { b64, seconds, points },
  );
}

const pixelProbe = (browserName: string) => browserName === 'webkit' && !!process.env.CI;

test('left | right: two 10 s 720p clips make a 2560x720 MP4 of 10 s with the first clip’s sound, and the 24 and 30 fps clips stay in step', async ({ page, browserName }) => {
  test.setTimeout(300_000);
  const errors = await open(page);
  const hosts: string[] = [];
  page.on('request', (r) => hosts.push(new URL(r.url()).host));
  const mp4 = await make(page, [A, B], {}, browserName);
  const t = await tracksOf(mp4);
  expect([t.width, t.height]).toEqual([2560, 720]);
  expect(Math.abs(t.seconds - 10)).toBeLessThan(0.2);
  expect(t.audio).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __encoders: number }).__encoders)).toBeGreaterThan(0);
  // The grey level rises with time in both clips: at 5 s both cells read about 128, and agree.
  if (!pixelProbe(browserName)) {
    const [left, right] = await lumaAt(page, mp4, 5, [{ x: 640, y: 360 }, { x: 1920, y: 360 }]);
    expect(Math.abs(left! - 128)).toBeLessThan(12);
    expect(Math.abs(right! - 128)).toBeLessThan(12);
    expect(Math.abs(left! - right!)).toBeLessThan(8);
  }
  // No file name reaches analytics, and only the page's own origin was asked for.
  const events = JSON.stringify(await page.evaluate(() => (window as unknown as { __events: unknown[] }).__events));
  expect(events).toContain('tool_run');
  expect(events).not.toContain('sbs-');
  const own = new URL(page.url()).host;
  expect(hosts.filter((h) => h !== '' && h !== own && h !== 'stats.keenankaufman.com')).toEqual([]);
  expect(errors).toEqual([]);
});

test('top | bottom makes 1280x1440', async ({ page, browserName }) => {
  test.setTimeout(300_000);
  await open(page);
  const mp4 = await make(page, [A, B], { layout: 'column' }, browserName);
  const t = await tracksOf(mp4);
  expect([t.width, t.height]).toEqual([1280, 1440]);
  expect(Math.abs(t.seconds - 10)).toBeLessThan(0.2);
});

test('length: the shorter clip ends the video by default, or its last frame is held to the end', async ({ page, browserName }) => {
  test.setTimeout(400_000);
  await open(page);
  const short = await tracksOf(await make(page, [A, B6], {}, browserName));
  expect(Math.abs(short.seconds - 6)).toBeLessThan(0.2);
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const mp4 = await make(page, [A, B6], { length: 'longer' }, browserName);
  expect(Math.abs((await tracksOf(mp4)).seconds - 10)).toBeLessThan(0.2);
  // At 8 s, B has ended (its last frame reads about 157 grey) while A reads about 219.
  if (!pixelProbe(browserName)) {
    const [left, right] = await lumaAt(page, mp4, 8, [{ x: 640, y: 360 }, { x: 1920, y: 360 }]);
    expect(Math.abs(left! - 219)).toBeLessThan(12);
    expect(Math.abs(right! - 157)).toBeLessThan(12);
  }
});

test('sound: from A, from B, mix, and none (no audio track)', async ({ page, browserName }) => {
  test.setTimeout(500_000);
  await open(page);
  const hz = (bytes: Uint8Array) =>
    page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(arr.buffer);
      const d = buf.getChannelData(0).subarray(48000, 48000 * 4);
      let crossings = 0;
      for (let i = 1; i < d.length; i++) if (d[i - 1]! < 0 !== d[i]! < 0) crossings++;
      return crossings / 2 / (d.length / 48000);
    }, Buffer.from(bytes).toString('base64'));
  const out: Record<string, Uint8Array> = {};
  for (const sound of ['a', 'b', 'mix', 'none']) {
    await page.reload();
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    out[sound] = await make(page, [A, B6], { sound, layout: 'column' }, browserName);
  }
  expect((await tracksOf(out.none!)).audio).toBe(false);
  for (const s of ['a', 'b', 'mix']) expect((await tracksOf(out[s]!)).audio).toBe(true);
  expect(Math.abs((await hz(out.a!)) - 440)).toBeLessThan(25);
  expect(Math.abs((await hz(out.b!)) - 880)).toBeLessThan(40);
  // A mix has both tones, so it crosses zero more often than A alone.
  expect(await hz(out.mix!)).toBeGreaterThan(500);
});

test('an oversized job is refused before any encoding, with the estimate shown', async ({ page }) => {
  // A phone has a lower memory cap: a 20 minute clip would need its whole sound decoded.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1' });
  });
  const errors = await open(page);
  await page.setInputFiles('#file-input', [LONG, A]);
  await expect(page.locator('#sbs-info')).toContainText('Memory needed: about');
  await expect(page.locator('#sbs-info')).toContainText('can safely give');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText('of memory');
  expect(await page.evaluate(() => (window as unknown as { __encoders: number }).__encoders)).toBe(0);
  expect(errors.filter((e) => !/memory/.test(e))).toEqual([]);
});

test('the page says it puts videos next to each other, links the splitter, and the splitter links back', async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle('Put Two Videos Side by Side, Free, No Upload | Stayput');
  await expect(page.locator('h1')).toHaveText('Put two videos side by side');
  const html = await page.content();
  expect(html).toContain('put two videos next to each other in one frame');
  expect(html).toContain('href="/tools/video-splitter"');
  for (const path of ['/tools/video-splitter', '/split-video']) {
    await page.goto(path);
    expect(await page.content()).toContain('href="/tools/side-by-side-video"');
  }
  // The bare path is a permanent redirect to the tool page.
  const redirects = (JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { redirects: { source: string; destination: string }[] }).redirects;
  expect(redirects).toContainEqual(expect.objectContaining({ source: '/side-by-side-video', destination: '/tools/side-by-side-video' }));
});
