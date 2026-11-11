// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// UnsupportedCodec round 2: the convert (MP4, MOV), WebM, AVI, speed, reverse, side-by-side and frames tools play a clip in the browser's own
// video player before refusing it. For each: a clip WebCodecs refuses but the player plays finishes through the player; a clip neither can
// decode is refused with a class named for the cause and does not hang. Every clip is a small committed fixture; nothing large is committed.
const f = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const SOUND = f('flat-blue-tone.mp4'); // 320x240, 15 fps, 3 s, with sound
const SILENT = f('pixel-aspect-99-100.mp4'); // 640x360, 10 fps, 2 s, no sound
const PORTRAIT = f('iphone-portrait.mov'); // 1280x720 recorded turned a quarter, 4 s, with sound
const HEVC = f('iphone-hevc.mov');
const WEBM = f('talk.webm'); // VP8 + Opus: not copied into an MP4 or MOV, so it is decoded
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const PLAYER_NOTE = "browser's own video player";

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
/** Nor can the player: canPlayType answers "no" (for one type, or for everything). */
async function playerRefuses(page: Page, only?: string) {
  await page.addInitScript((only) => {
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (this: HTMLMediaElement, type: string) {
      return !only || type === only ? '' : original.call(this, type);
    };
  }, only);
}
/** Only HEVC is refused by WebCodecs. */
async function hevcRefused(page: Page) {
  await page.addInitScript(() => {
    const original = VideoDecoder.isConfigSupported.bind(VideoDecoder);
    VideoDecoder.isConfigSupported = async (config: VideoDecoderConfig) => (/^(hvc1|hev1)/.test(config.codec) ? { supported: false, config } : original(config));
  });
}

type Upload = { name: string; mimeType: string; buffer: Buffer };
/** A fixture as an upload, so one pick can mix fixtures with clips whose name or type is chosen here. */
const asUpload = (path: string): Upload => ({ name: path.split('/').pop()!, mimeType: path.endsWith('.mov') ? 'video/quicktime' : 'video/mp4', buffer: readFileSync(path) });
async function open(page: Page, path: string, files: (string | Upload)[]) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const mixed = files.some((x) => typeof x !== 'string');
  await page.locator('#file-input').setInputFiles((mixed ? files.map((x) => (typeof x === 'string' ? asUpload(x) : x)) : files) as string[]);
}
const done = (page: Page) => expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
const failed = (page: Page) => expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
const SPLIT = /^Unsupported(Codec|Hevc|Hdr|Av1|ProRes)$/;

test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux CI WebKit cannot decode video in the page');
});

// ---- Each library: WebCodecs refuses, the player plays, so it finishes through the player ----
// `source` is a clip the tool decodes (not one it copies as it is); `mute` where the output format needs a sound codec CI Chromium lacks.
const PLAYER_CASES: { slug: string; path: string; files: string[]; mute?: boolean; compat?: boolean }[] = [
  { slug: 'video-to-mp4', path: '/tools/video-to-mp4', files: [WEBM] },
  { slug: 'video-to-mov', path: '/tools/video-to-mov', files: [WEBM], mute: true },
  { slug: 'video-to-webm', path: '/tools/video-to-webm', files: [SOUND] },
  { slug: 'video-to-avi (Motion JPEG)', path: '/tools/video-to-avi', files: [SOUND] },
  { slug: 'video-to-avi (H.264)', path: '/tools/video-to-avi', files: [SOUND], compat: false },
  { slug: 'video-speed', path: '/tools/video-speed', files: [SOUND] },
  { slug: 'reverse-video', path: '/tools/reverse-video', files: [SOUND] },
  { slug: 'video-to-jpg', path: '/tools/video-to-jpg', files: [SOUND] },
];
for (const c of PLAYER_CASES) {
  test(`${c.slug}: WebCodecs refuses but the player plays it, so it finishes through the player`, async ({ page }) => {
    test.setTimeout(240_000);
    await stubAnalytics(page);
    await webCodecsRefuses(page);
    await open(page, c.path, c.files);
    if (c.mute) await page.locator('#mute').check();
    if (c.compat === false) await page.locator('#compat').uncheck();
    await page.locator('#run').click();
    await done(page);
    await expect(page.locator('#results-list')).toContainText(PLAYER_NOTE);
    expect((await lastRun(page))?.outcome).toBe('ok');
  });
}

// ---- Neither can decode: a class named for the cause, no hang ----
const REFUSED_CASES: { slug: string; path: string; files: string[]; expected: RegExp }[] = [
  { slug: 'video-to-mp4', path: '/tools/video-to-mp4', files: [WEBM], expected: /^UnsupportedCodec$/ },
  { slug: 'video-to-mov', path: '/tools/video-to-mov', files: [WEBM], expected: /^UnsupportedCodec$/ },
  { slug: 'video-to-webm', path: '/tools/video-to-webm', files: [SOUND], expected: /^UnsupportedCodec$/ },
  { slug: 'video-to-avi', path: '/tools/video-to-avi', files: [SOUND], expected: /^UnsupportedCodec$/ },
  { slug: 'video-speed', path: '/tools/video-speed', files: [HEVC], expected: /^UnsupportedHevc$/ },
  { slug: 'reverse-video', path: '/tools/reverse-video', files: [HEVC], expected: /^UnsupportedHevc$/ },
  { slug: 'video-to-jpg', path: '/tools/video-to-jpg', files: [HEVC], expected: /^UnsupportedHevc$/ },
];
for (const c of REFUSED_CASES) {
  test(`${c.slug}: neither WebCodecs nor the player can decode it: ${c.expected.source.replace(/[\^$]/g, '')}, no hang`, async ({ page }) => {
    await stubAnalytics(page);
    await webCodecsRefuses(page);
    await playerRefuses(page);
    await open(page, c.path, c.files);
    await page.locator('#run').click();
    await failed(page);
    await expect(page.locator('#error')).toContainText('cannot decode');
    const cls = (await lastRun(page))?.error_class ?? '';
    expect(cls).toMatch(c.expected);
  });
}

test('video-to-mp4: an HEVC clip is still copied as it is (MP4 can hold it), not refused', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await hevcRefused(page);
  await playerRefuses(page);
  await open(page, '/tools/video-to-mp4', [HEVC]);
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText('copied');
});

// ---- speed-up-video / slow-down-video ----
const speedRun = async (page: Page, path: string, files: string[], speed?: string) => {
  await open(page, path, files);
  if (speed) await page.locator('#speed').selectOption(speed);
  await page.locator('#run').click();
  await done(page);
};
for (const [speed, label] of [['2', '2× speed'], ['0.5', '0.5× speed']] as const) {
  test(`video-speed ${speed}x: with sound keeps the sound, without sound writes none`, async ({ page }) => {
    test.setTimeout(240_000);
    await stubAnalytics(page);
    await speedRun(page, '/tools/video-speed', [SOUND], speed);
    await expect(page.locator('#results-list')).toContainText(label);
    await expect(page.locator('#results-list')).not.toContainText('no sound');
    expect((await lastRun(page))?.outcome).toBe('ok');
    await page.locator('#clear').click();
    await page.locator('#file-input').setInputFiles([SILENT]);
    await page.locator('#run').click();
    await done(page);
    await expect(page.locator('#results-list')).toContainText('no sound');
  });
}
test('speed-up-video and slow-down-video (the preset pages) finish', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await speedRun(page, '/speed-up-video', [SOUND]);
  await expect(page.locator('#results-list')).toContainText('2× speed');
  await speedRun(page, '/slow-down-video', [SILENT]);
  await expect(page.locator('#results-list')).toContainText('0.5× speed');
});

test('video-speed: a player-only clip at 2x with sound finishes through the player with sound', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await webCodecsRefuses(page);
  await speedRun(page, '/tools/video-speed', [SOUND], '2');
  await expect(page.locator('#results-list')).toContainText(PLAYER_NOTE);
  await expect(page.locator('#results-list')).not.toContainText('no sound');
  // 3 s at 2x is 1.5 s: "now 2 s" once rounded.
  await expect(page.locator('#results-list')).toContainText(/now [12] s/);
});

test('video-speed: an OperationError at encoder creation recovers through the ladder', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await page.addInitScript(() => ((window as unknown as { __stayputNoSizeProbe: boolean }).__stayputNoSizeProbe = true));
  await page.addInitScript(() => {
    let armed = false;
    const configure = VideoEncoder.prototype.configure;
    VideoEncoder.prototype.configure = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['configure']>) {
      // The probe encoders are 320x240; the run's own encoder is made at the clip's size.
      if (args[0].width >= 640 && !armed) {
        armed = true;
        throw new DOMException('forced by the test', 'OperationError');
      }
      return configure.apply(this, args);
    };
  });
  await speedRun(page, '/tools/video-speed', [PORTRAIT]);
  await expect(page.locator('#results-list')).toContainText(/second try|software|smaller size/);
  expect((await lastRun(page))?.outcome).toBe('ok');
});

test("video-speed: an encoder stall (the watchdog's EncoderStall) recovers through the ladder", async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await page.addInitScript(() => ((window as unknown as { __stayputNoSizeProbe: boolean }).__stayputNoSizeProbe = true));
  await page.addInitScript(() => {
    let armed = false;
    const encode = VideoEncoder.prototype.encode;
    VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
      if (!armed && /Changing speed/.test(document.getElementById('progress-text')?.textContent ?? '')) {
        armed = true;
        throw Object.assign(new Error('forced by the test'), { name: 'EncoderStall' });
      }
      return encode.apply(this, args);
    };
  });
  await speedRun(page, '/tools/video-speed', [SOUND]);
  await expect(page.locator('#results-list')).toContainText(/second try|software|smaller size/);
  expect((await lastRun(page))?.outcome).toBe('ok');
});

test('video-speed: a bare failure inside the run is named for its step, never a plain Error', async ({ page }) => {
  await stubAnalytics(page);
  // A bare TypeError from the first encoded frame is not one the ladder retries: it ends the run with the step it reached.
  await page.addInitScript(() => {
    const encode = VideoEncoder.prototype.encode;
    VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
      if (/Changing speed/.test(document.getElementById('progress-text')?.textContent ?? '')) throw new TypeError('forced by the test');
      return encode.apply(this, args);
    };
  });
  await open(page, '/tools/video-speed', [SOUND]);
  await page.locator('#run').click();
  await failed(page);
  expect((await lastRun(page))?.error_class).toMatch(/^VideoSpeedFailed(Open|Plan|Sound|Setup|Encode|Write)$/);
});

// ---- reverse-video: a player-only source stays inside the frame window ----
test('reverse-video: a player-only source holds a few frames at a time (the window is not exceeded)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Counting open VideoFrames is a Chromium check; WebKit is covered by the finishing case above');
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await webCodecsRefuses(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __peak: number };
    w.__peak = 0;
    let open = 0;
    const live = new WeakSet<object>();
    const Orig = VideoFrame;
    (window as unknown as { VideoFrame: unknown }).VideoFrame = new Proxy(Orig, {
      construct(target, args, nt) {
        const frame = Reflect.construct(target, args, nt) as VideoFrame;
        live.add(frame);
        open++;
        w.__peak = Math.max(w.__peak, open);
        return frame;
      },
    });
    const close = Orig.prototype.close;
    Orig.prototype.close = function (this: VideoFrame) {
      if (live.delete(this)) open--;
      return close.call(this);
    };
  });
  // Chromium's player does not open a .mov by its type: the same H.264 clip is handed over as an MP4.
  await open(page, '/tools/reverse-video', [{ name: 'iphone-portrait.mp4', mimeType: 'video/mp4', buffer: readFileSync(PORTRAIT) }]);
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText(PLAYER_NOTE);
  // 4 s at 30 fps is 120 frames; the player path holds one at a time.
  expect(await page.evaluate(() => (window as unknown as { __peak: number }).__peak)).toBeLessThanOrEqual(8);
});

test('reverse-video: the usual path still finishes with sound', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await open(page, '/tools/reverse-video', [SOUND]);
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).not.toContainText('no sound');
});

// ---- side-by-side-video ----
const sbs = async (page: Page, files: (string | Upload)[], opts: Record<string, string> = {}) => {
  await open(page, '/tools/side-by-side-video', files);
  for (const [k, v] of Object.entries(opts)) await page.locator(`#sbs-${k}`).selectOption(v);
  await page.locator('#run').click();
};

test('side-by-side-video: one playable clip and one HEVC clip neither can decode: the bad clip is named, with its cause', async ({ page }) => {
  await stubAnalytics(page);
  await hevcRefused(page);
  await playerRefuses(page, 'video/quicktime');
  await sbs(page, [SOUND, { name: 'bad-clip.mov', mimeType: 'video/quicktime', buffer: readFileSync(HEVC) }]);
  await failed(page);
  await expect(page.locator('#error')).toContainText('bad-clip.mov');
  await expect(page.locator('#error')).not.toContainText('flat-blue-tone.mp4');
  expect((await lastRun(page))?.error_class).toBe('UnsupportedHevc');
});

test('side-by-side-video: the same when it is clip A that cannot be read', async ({ page }) => {
  await stubAnalytics(page);
  await hevcRefused(page);
  await playerRefuses(page, 'video/quicktime');
  await sbs(page, [{ name: 'bad-clip.mov', mimeType: 'video/quicktime', buffer: readFileSync(HEVC) }, SOUND]);
  await failed(page);
  await expect(page.locator('#error')).toContainText('bad-clip.mov');
  expect((await lastRun(page))?.error_class).toBe('UnsupportedHevc');
});

test('side-by-side-video: both clips WebCodecs cannot decode but the player plays finish through the player', async ({ page }) => {
  test.setTimeout(300_000);
  await stubAnalytics(page);
  await webCodecsRefuses(page);
  await sbs(page, [SOUND, SILENT]);
  await done(page);
  await expect(page.locator('#results-list')).toContainText(PLAYER_NOTE);
  expect((await lastRun(page))?.outcome).toBe('ok');
});

test('side-by-side-video: one clip WebCodecs cannot decode (the player plays it) beside one it can', async ({ page }) => {
  test.setTimeout(300_000);
  await stubAnalytics(page);
  await hevcRefused(page);
  await sbs(page, [SOUND, { name: 'phone.mov', mimeType: 'video/quicktime', buffer: readFileSync(HEVC) }]);
  await page.locator('#results.is-active, #error.is-active').first().waitFor({ timeout: 240_000 });
  // The player plays HEVC where this browser has the codec (a Mac); elsewhere the clip is refused with its class.
  const run = await lastRun(page);
  if (run?.outcome === 'error') expect(run.error_class).toBe('UnsupportedHevc');
  else await expect(page.locator('#results-list')).toContainText(PLAYER_NOTE);
});

test('side-by-side-video: mixed sizes, a rotated clip, different frame rates and one clip without sound', async ({ page }) => {
  test.setTimeout(300_000);
  await stubAnalytics(page);
  // 320x240 at 15 fps with sound, beside a 1280x720 clip recorded turned a quarter.
  await sbs(page, [SOUND, PORTRAIT], { sound: 'mix' });
  await done(page);
  await expect(page.locator('#results-list')).toContainText('with sound');
  expect((await lastRun(page))?.outcome).toBe('ok');
  await page.locator('#clear').click();
  // 640x360 at 10 fps with no sound beside the 15 fps clip: A's sound was asked for, A has none.
  await page.locator('#file-input').setInputFiles([SILENT, SOUND]);
  await page.locator('#sbs-sound').selectOption('a');
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText('sound left out: the clip has none');
  await page.locator('#clear').click();
  await page.locator('#file-input').setInputFiles([SILENT, SOUND]);
  await page.locator('#sbs-sound').selectOption('b');
  await page.locator('#run').click();
  await done(page);
  await expect(page.locator('#results-list')).toContainText('with sound');
});

// ---- Reading failures still win ----
test('a read failure is never renamed by the fallback (Android NotReadable ends as its own class on webm and speed)', async ({ browser, browserName }) => {
  test.skip(browserName === 'webkit', 'An Android phone is Chromium; the read-failure classes are covered on WebKit by their own specs');
  for (const [path, file] of [['/tools/video-to-webm', SOUND], ['/tools/video-speed', SOUND]] as const) {
    const context = await browser.newContext({ userAgent: ANDROID });
    const page = await context.newPage();
    await stubAnalytics(page);
    await webCodecsRefuses(page);
    await playerRefuses(page);
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
    await open(page, path, [file]);
    // Run stays disabled while the file-intake check reads the file. Only once it is enabled is the check over, so the reads can start failing without hitting the check itself (which would refuse the file before Run, and Run would never enable).
    await expect(page.locator('#run')).toBeEnabled();
    await page.evaluate(() => ((window as unknown as { __late: boolean }).__late = true));
    await page.locator('#run').click();
    await failed(page);
    const cls = (await lastRun(page))?.error_class ?? '';
    expect(cls, path).toMatch(/^NotReadable|^UnreadableFile/);
    expect(cls, path).not.toMatch(SPLIT);
    expect(cls, path).not.toMatch(/Failed(Open|Plan|Sound|Setup|Encode|Write)$/);
    await context.close();
  }
});

for (const [slug, path, mime] of [
  ['video-to-mp4', '/tools/video-to-mp4', 'video/mp4'],
  ['video-speed', '/tools/video-speed', 'video/mp4'],
  ['side-by-side-video', '/tools/side-by-side-video', 'video/mp4'],
  ['video-to-jpg', '/tools/video-to-jpg', 'video/mp4'],
] as const) {
  test(`${slug}: an unreadable container keeps its read class, not an Unsupported* class`, async ({ page }) => {
    await stubAnalytics(page);
    await webCodecsRefuses(page);
    const junk = { name: 'broken.mp4', mimeType: mime, buffer: Buffer.alloc(4096, 7) };
    await open(page, path, slug === 'side-by-side-video' ? [{ ...junk, name: 'broken-a.mp4' }, { ...junk, name: 'broken-b.mp4' }] : [junk]);
    await page.locator('#run').click();
    await failed(page);
    const cls = (await lastRun(page))?.error_class ?? '';
    expect(cls).toMatch(/^(UnreadableContainer|NotAVideoContainer|ContainerParseFailed|UnreadableHeaderShort|NoVideoTrack)$/);
  });
}
