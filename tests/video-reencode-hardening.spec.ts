// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { classifyCodec } from '../src/lib/video-fallback';
import { overBudget, PHONE_BUDGET, LOW_MEMORY_BUDGET } from '../src/lib/merge-budget';

// Hardening of compress-video, resize-video and merge-videos: a clip WebCodecs refuses but the browser's own player plays is
// finished through the player; a clip neither can decode is refused with a class named for the cause; compress, merge and resize
// name where they stopped; a merge over a phone's budget is refused early naming the clip to shorten; a read failure is never renamed.
// Every clip is a small committed fixture or made from one here; nothing large is committed.
const f = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const SOUND = f('flat-blue-tone.mp4'); // 320x240, 15 fps, with sound
const SILENT = f('pixel-aspect-99-100.mp4'); // 640x360, 10 fps, no sound
const PORTRAIT = f('iphone-portrait.mov'); // 1280x720 recorded turned a quarter, with sound
const HEVC = f('iphone-hevc.mov');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

type Ev = { n: string; d: Record<string, string> };
async function stubAnalytics(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}
const lastRun = (page: Page) => page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as Ev[]).filter((e) => e.n === 'tool_run').at(-1)?.d);

/** WebCodecs says it cannot decode anything: the browser's own player is then the only way in. */
async function webCodecsRefuses(page: Page) {
  await page.addInitScript(() => {
    VideoDecoder.isConfigSupported = async (config: VideoDecoderConfig) => ({ supported: false, config });
  });
}
/** Nor can the player: canPlayType answers "no" for everything. */
async function playerRefuses(page: Page, only?: string) {
  await page.addInitScript((only) => {
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (this: HTMLMediaElement, type: string) {
      return !only || type === only ? '' : original.call(this, type);
    };
  }, only);
}
/** Only HEVC is refused by WebCodecs (the player is made to refuse QuickTime files, the container of the HEVC fixture). */
async function hevcRefused(page: Page) {
  await page.addInitScript(() => {
    const original = VideoDecoder.isConfigSupported.bind(VideoDecoder);
    VideoDecoder.isConfigSupported = async (config: VideoDecoderConfig) => (/^(hvc1|hev1)/.test(config.codec) ? { supported: false, config } : original(config));
  });
}

async function open(page: Page, path: string, files: string[] | { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(files as string[]);
}
const done = (page: Page) => expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
const failed = (page: Page) => expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });

// Encode specs are skipped on Linux CI WebKit, which stalls decoding video in the page; they run on Chromium everywhere and on macOS WebKit.
test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux CI WebKit cannot decode video in the page');
});

// ---- Pure: the cause of an undecodable video, by codec, parameters and colour ----
test('the cause of an undecodable clip: HEVC, HDR or 10-bit, AV1, ProRes, else UnsupportedCodec', () => {
  expect(classifyCodec('hevc', 'hvc1.1.6.L93.B0', false)).toBe('UnsupportedHevc');
  expect(classifyCodec('hevc', 'hvc1.2.4.L120.B0', false)).toBe('UnsupportedHdr'); // Main 10
  expect(classifyCodec('hevc', 'hvc1.1.6.L93.B0', true)).toBe('UnsupportedHdr'); // PQ or HLG
  expect(classifyCodec('avc', 'avc1.6E0033', false)).toBe('UnsupportedHdr'); // High 10
  expect(classifyCodec('vp9', 'vp09.02.10.10', false)).toBe('UnsupportedHdr');
  expect(classifyCodec('av1', 'av01.0.08M.08', false)).toBe('UnsupportedAv1');
  expect(classifyCodec('av1', 'av01.0.08M.10', false)).toBe('UnsupportedHdr');
  expect(classifyCodec(null, null, false, true)).toBe('UnsupportedProRes');
  expect(classifyCodec(null, null, false, false)).toBe('UnsupportedCodec');
  expect(classifyCodec('vp8', 'vp8', false)).toBe('UnsupportedCodec');
});

test('the merge budget: a computer has none; a phone and a 2 GB device do, and the longest clip is named', () => {
  const clips = [
    { name: 'short.mp4', size: 10e6, length: 30 },
    { name: 'long.mp4', size: 20e6, length: 600 },
  ];
  expect(overBudget(clips, null)).toBeNull();
  const e = overBudget(clips, PHONE_BUDGET)!;
  expect(e.name).toBe('MergeTooBig');
  expect(e.message).toContain('long.mp4');
  expect(overBudget([{ name: 'a.mp4', size: 10e6, length: 200 }], PHONE_BUDGET)).toBeNull();
  expect(overBudget([{ name: 'a.mp4', size: 10e6, length: 300 }], LOW_MEMORY_BUDGET)?.name).toBe('MergeTooBig');
  // Over on size alone: the biggest file is named.
  expect(overBudget([{ name: 'big.mp4', size: 250e6, length: 20 }, { name: 'small.mp4', size: 1e6, length: 20 }], PHONE_BUDGET)?.message).toContain('big.mp4');
});

// ---- The player path: WebCodecs refuses, the browser's own player plays ----
for (const [slug, files] of [
  ['compress-video', [SOUND]],
  ['resize-video', [SOUND]],
  ['merge-videos', [SOUND, SILENT]],
] as const) {
  test(`${slug}: WebCodecs refuses but the player plays it, so it finishes through the player`, async ({ page }) => {
    test.setTimeout(240_000);
    await stubAnalytics(page);
    await webCodecsRefuses(page);
    await open(page, `/tools/${slug}`, [...files]);
    await page.locator('#run').click();
    await done(page);
    await expect(page.locator('#results-list')).toContainText("browser's own video player");
    expect((await lastRun(page))?.outcome).toBe('ok');
  });
}

// ---- Neither can decode: a class named for the cause, no hang ----
for (const slug of ['compress-video', 'resize-video']) {
  test(`${slug}: neither WebCodecs nor the player can decode an HEVC clip: UnsupportedHevc`, async ({ page }) => {
    await stubAnalytics(page);
    await webCodecsRefuses(page);
    await playerRefuses(page);
    await open(page, `/tools/${slug}`, [HEVC]);
    await page.locator('#run').click();
    await failed(page);
    await expect(page.locator('#error')).toContainText('cannot decode');
    expect((await lastRun(page))?.error_class).toBe('UnsupportedHevc');
  });
}

test('merge-videos: neither can decode one clip: UnsupportedHevc, and the message names the clip', async ({ page }) => {
  await stubAnalytics(page);
  await hevcRefused(page);
  await playerRefuses(page, 'video/quicktime');
  await open(page, '/tools/merge-videos', [SOUND, HEVC]);
  await page.locator('#run').click();
  await failed(page);
  await expect(page.locator('#error')).toContainText('iphone-hevc.mov');
  expect((await lastRun(page))?.error_class).toBe('UnsupportedHevc');
});

test('an Android phone without an HEVC decoder is still told to use Most compatible', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: ANDROID });
  const page = await context.newPage();
  await stubAnalytics(page);
  await webCodecsRefuses(page);
  await playerRefuses(page);
  await open(page, '/tools/compress-video', [HEVC]);
  await page.locator('#run').click();
  await failed(page);
  await expect(page.locator('#error')).toContainText('Most compatible');
  await context.close();
});

// ---- compress-video ----
test('compress-video: a size target the length cannot meet is CompressTargetTooSmall, with the way out', async ({ page }) => {
  await stubAnalytics(page);
  await open(page, '/tools/compress-video', [f('sbs-long-20min.mp4')]);
  await page.locator('#mode').selectOption('size');
  await page.locator('#size').selectOption('8');
  await page.locator('#run').click();
  await failed(page);
  await expect(page.locator('#error')).toContainText('too long to fit in 8 MB');
  expect((await lastRun(page))?.error_class).toBe('CompressTargetTooSmall');
});

test('compress-video: a result bigger than the original is reported as an outcome, not a failure', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', "Safari's encoder makes this tiny clip smaller; the bigger-output case is Chromium's");
  test.setTimeout(240_000);
  await stubAnalytics(page);
  // A 1-second flat clip of a few KB: the encoder's output is bigger than it.
  await open(page, '/tools/compress-video', [f('hd-flat.mp4')]);
  await page.locator('#mode').selectOption('high');
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText('bigger than, the original');
  expect((await lastRun(page))?.outcome).toBe('ok');
});

test('compress-video: an OperationError at encoder creation recovers through the ladder', async ({ page, browserName }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await page.addInitScript(() => ((window as unknown as { __stayputNoSizeProbe: boolean }).__stayputNoSizeProbe = true));
  await page.addInitScript(() => {
    let armed = false;
    const configure = VideoEncoder.prototype.configure;
    VideoEncoder.prototype.configure = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['configure']>) {
      if (/Compressing/.test(document.getElementById('progress-text')?.textContent ?? '') && !armed) {
        armed = true;
        throw new DOMException('forced by the test', 'OperationError');
      }
      return configure.apply(this, args);
    };
  });
  await open(page, '/tools/compress-video', [PORTRAIT]);
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText(browserName === 'webkit' ? /second try|software|smaller size/ : /second try|software|smaller size/);
  expect((await lastRun(page))?.outcome).toBe('ok');
});

test('compress-video: an encoder stall (the watchdog\'s EncoderStall) recovers through the ladder', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await page.addInitScript(() => ((window as unknown as { __stayputNoSizeProbe: boolean }).__stayputNoSizeProbe = true));
  // Waiting out the 60 s watchdog adds nothing: the first frame of the clip makes the encoder fail with the error the watchdog raises, once.
  await page.addInitScript(() => {
    let armed = false;
    const encode = VideoEncoder.prototype.encode;
    VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
      if (!armed && /Compressing/.test(document.getElementById('progress-text')?.textContent ?? '')) {
        armed = true;
        throw Object.assign(new Error('forced by the test'), { name: 'EncoderStall' });
      }
      return encode.apply(this, args);
    };
  });
  await open(page, '/tools/compress-video', [SOUND]);
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText(/second try|software|smaller size/);
  expect((await lastRun(page))?.outcome).toBe('ok');
});

// ---- merge-videos ----
test('merge-videos: mixed sizes, rotations, frame rates and one clip without sound join into one video', async ({ page }) => {
  test.setTimeout(300_000);
  await stubAnalytics(page);
  await open(page, '/tools/merge-videos', [SOUND, SILENT, PORTRAIT, f('sbs-b-30fps.mp4')]);
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText('4 videos joined');
  expect((await lastRun(page))?.outcome).toBe('ok');
});

test('merge-videos: one broken clip is named, with the class of its cause', async ({ page }) => {
  await stubAnalytics(page);
  await open(page, '/tools/merge-videos', [
    { name: 'fine.mp4', mimeType: 'video/mp4', buffer: readFileSync(SOUND) },
    { name: 'broken-clip.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(4096, 7) },
  ]);
  await page.locator('#run').click();
  await failed(page);
  await expect(page.locator('#error')).toContainText('broken-clip.mp4');
  expect((await lastRun(page))?.error_class).toMatch(/^(UnreadableContainer|NotAVideoContainer|ContainerParseFailed|UnreadableHeaderShort|NoVideoTrack)$/);
});

test('merge-videos: over the budget of a phone with 2 GB of memory is refused early, naming the clip to shorten', async ({ page }) => {
  await stubAnalytics(page);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 2 }));
  // Two 130 s clips are 260 s: over the 240 s a 2 GB device may join.
  await open(page, '/tools/merge-videos', [f('clip-130s.mp4'), f('clip-130s.mp4')]);
  await page.locator('#run').click();
  await failed(page);
  await expect(page.locator('#error')).toContainText('clip-130s.mp4');
  expect((await lastRun(page))?.error_class).toBe('MergeTooBig');
});

test('merge-videos: an iPhone is held to its budget too', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: IPHONE });
  const page = await context.newPage();
  await stubAnalytics(page);
  // Five 130 s clips are 650 s: over the 480 s a phone may join.
  await open(page, '/tools/merge-videos', Array.from({ length: 5 }, () => f('clip-130s.mp4')));
  await page.locator('#run').click();
  await failed(page);
  expect((await lastRun(page))?.error_class).toBe('MergeTooBig');
  await context.close();
});

// ---- resize-video ----
test('resize-video: an odd custom size is made even and finishes', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await open(page, '/tools/resize-video', [SOUND]);
  await page.locator('#size').selectOption('custom');
  await page.locator('#width').fill('301');
  await page.locator('#height').fill('199');
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText(/30[0-2]×(198|200)/);
});

test('resize-video: a size larger than the source finishes', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await open(page, '/tools/resize-video', [SOUND]);
  await page.locator('#size').selectOption('custom');
  await page.locator('#width').fill('1280');
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText('1280×');
});

test('resize-video: a size above what an encoder writes is refused or lowered, never a hang or a bare error', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await open(page, '/tools/resize-video', [SOUND]);
  await page.locator('#size').selectOption('custom');
  await page.locator('#width').fill('7680');
  await page.locator('#height').fill('4320');
  await page.locator('#run').click();
  await expect(page.locator('#results.is-active, #error.is-active').first()).toBeVisible({ timeout: 200_000 });
  const run = await lastRun(page);
  if (run?.outcome === 'error') expect(run.error_class).not.toBe('Error');
});

test('resize-video: a rotated source comes out upright at the size asked for', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await open(page, '/tools/resize-video', [f('uhd-flat-rot90.mp4')]);
  await page.locator('#size').selectOption('480');
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText('480');
});

// ---- Reading failures win ----
test('a read failure is never renamed by the new classes (Android NotReadable still ends as its own class)', async ({ browser, browserName }) => {
  test.skip(browserName === 'webkit', 'An Android phone is Chromium; the read-failure classes are covered on WebKit by their own specs');
  const context = await browser.newContext({ userAgent: ANDROID });
  const page = await context.newPage();
  await stubAnalytics(page);
  await webCodecsRefuses(page);
  await playerRefuses(page);
  // Once the file is added and Run is pressed, the phone cannot read its bytes: every read throws NotReadableError (the intake read is left alone).
  await page.addInitScript(() => {
    const w = window as unknown as { __late: boolean };
    const { slice, arrayBuffer, stream } = Blob.prototype;
    const fail = () => new DOMException('The requested file could not be read.', 'NotReadableError');
    const bad = new WeakSet<object>();
    Blob.prototype.slice = function (...a: [number?, number?, string?]) {
      const out = slice.apply(this, a);
      if (w.__late) bad.add(out);
      return out;
    };
    Blob.prototype.arrayBuffer = function () {
      return w.__late || bad.has(this) ? Promise.reject(fail()) : arrayBuffer.call(this);
    };
    Blob.prototype.stream = function () {
      return w.__late ? new ReadableStream({ pull: (c) => c.error(fail()) }) : stream.call(this);
    };
  });
  await open(page, '/tools/compress-video', [SOUND]);
  await page.evaluate(() => ((window as unknown as { __late: boolean }).__late = true));
  await page.locator('#run').click();
  await failed(page);
  const cls = (await lastRun(page))?.error_class ?? '';
  expect(cls).toMatch(/^NotReadable|^UnreadableFile/);
  expect(cls).not.toMatch(/^Unsupported(Codec|Hevc|Hdr|Av1|ProRes)$/);
  expect(cls).not.toMatch(/^CompressFailed/);
  await context.close();
});
