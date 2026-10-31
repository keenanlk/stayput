// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { withRecovery, type Attempt, type RecoveryHooks } from '../src/lib/edit-recovery';
import { withoutSoftwareEncoder } from './no-software-encoder';
import { readFileSync } from 'node:fs';

// Reverse and merge recover the way compress does (resume after a hidden page, then a smaller picture), and a smaller size that
// worked is remembered for the rest of the tab. The encoder is made to fail in the page; the recovery rules run in Node.
const uhd = fileURLToPath(new URL('./fixtures/static/uhd-flat.mp4', import.meta.url));
const hd = fileURLToPath(new URL('./fixtures/static/hd-flat.mp4', import.meta.url));
const small = fileURLToPath(new URL('./fixtures/static/flat-blue-tone.mp4', import.meta.url));

const named = (name: string) => Object.assign(new Error(name), { name });

type Hooks = RecoveryHooks & { stored: number | undefined; writes: number[] };

function hooks(over: Partial<RecoveryHooks> = {}): Hooks {
  const h: Hooks = {
    stored: undefined as number | undefined,
    writes: [] as number[],
    wasHidden: () => false,
    forgetHidden: () => {},
    whenVisible: async () => {},
    reclaimed: () => false,
    rung: {
      get: (): number | undefined => h.stored,
      set: (side: number) => {
        h.stored = side;
        h.writes.push(side);
      },
    },
    ...over,
  };
  return h;
}

test.describe('recovery rules', () => {
  test('a size that worked after a failure is remembered; a run that worked at full size writes nothing', async () => {
    const h = hooks();
    expect(await withRecovery(async () => 'ok', () => 1920, h)).toBe('ok');
    expect(h.writes).toEqual([]);

    const seen: Attempt[] = [];
    await withRecovery(
      async (a) => {
        seen.push({ ...a });
        if (seen.length === 1) throw named('EncodingError');
        return 'ok';
      },
      () => 1920,
      h,
    );
    expect(seen[1]).toMatchObject({ maxSide: 1280, retry: 'smaller' });
    expect(h.writes).toEqual([1280]);
  });

  test('the next run starts at the remembered size, and a run that works there writes nothing new', async () => {
    const h = hooks();
    h.stored = 1280;
    const seen: Attempt[] = [];
    await withRecovery(async (a) => void seen.push({ ...a }), () => 1280, h);
    expect(seen).toEqual([{ maxSide: 1280, retry: 'remembered', remembered: true }]);
    expect(h.writes).toEqual([]);
  });

  test('a run that fails at the remembered size steps down from there and keeps the smaller size', async () => {
    const h = hooks();
    h.stored = 1280;
    const seen: Attempt[] = [];
    await withRecovery(
      async (a) => {
        seen.push({ ...a });
        if (seen.length === 1) throw named('EncodingError');
        return 'ok';
      },
      () => 1280,
      h,
    );
    expect(seen[1]).toMatchObject({ maxSide: 854, retry: 'smaller' });
    expect(h.stored).toBe(854);
  });

  test('a software retry or a resume at the remembered size keeps the size', async () => {
    const h = hooks({ firstRung: () => ({ hardwareAcceleration: 'prefer-software' as const }) });
    h.stored = 1280;
    const seen: Attempt[] = [];
    await withRecovery(
      async (a) => {
        seen.push({ ...a });
        if (seen.length === 1) throw named('EncodingError');
        return 'ok';
      },
      () => 1280,
      h,
    );
    expect(seen[1]).toMatchObject({ maxSide: 1280, retry: 'software' });
    expect(h.writes).toEqual([]);
  });

  test('errors a retry cannot change are thrown at once with their own names', async () => {
    for (const name of ['InputError', 'UnreadableFile', 'UnsupportedCodec', 'AudioDecodeError', 'NoSoundTrack', 'ConversionInvalid', 'EditUnsupported', 'NoSpeechFound']) {
      let calls = 0;
      await expect(
        withRecovery(
          async () => {
            calls++;
            throw named(name);
          },
          () => 3840,
          hooks({ wasHidden: () => true }),
        ),
      ).rejects.toMatchObject({ name });
      expect(calls).toBe(1);
    }
  });
});

/**
 * In the page: the encoder throws `name` for the first `times` frames of the clip itself (not the encoder probe's small test frames).
 * With `hide`, the page also reports hidden for a moment at the first throw, as a phone does when apps are switched.
 */
async function breakEncoder(page: Page, name: string, times: number, hide = false) {
  await withoutSoftwareEncoder(page);
  await page.addInitScript(() => ((window as unknown as { __stayputNoSizeProbe: boolean }).__stayputNoSizeProbe = true));
  await page.addInitScript(
    ([name, times, hide]) => {
      // Counted in the tab's storage, so a page opened later in the same test does not start the count again.
      const count = () => Number(sessionStorage.getItem('test:thrown') ?? 0);
      const original = VideoEncoder.prototype.encode;
      VideoEncoder.prototype.encode = function (this: VideoEncoder, frame: VideoFrame, options?: VideoEncoderEncodeOptions) {
        if (frame.codedWidth >= 800 && count() < times) {
          sessionStorage.setItem('test:thrown', String(count() + 1));
          if (hide && count() === 1) {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
            setTimeout(() => {
              Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
              Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
              document.dispatchEvent(new Event('visibilitychange'));
            }, 600);
          }
          throw new DOMException('forced by the test', name as string);
        }
        return original.call(this, frame, options);
      };
    },
    [name, times, hide] as const,
  );
}

type Tool = { name: string; url: string; files: string[]; /** Options to set before Run. */ prepare?: (page: Page) => Promise<void> };
const tools: Tool[] = [
  { name: 'reverse', url: '/tools/reverse-video', files: [uhd] },
  { name: 'merge', url: '/tools/merge-videos', files: [uhd, small] },
];

async function run(page: Page, tool: Tool) {
  await page.goto(tool.url);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await tool.prepare?.(page);
  await page.locator('#file-input').setInputFiles(tool.files);
  await page.locator('#run').click();
}

/** The longest side the finished file's note reports (it reads "3840×2160"). */
async function longestSide(page: Page): Promise<number> {
  const text = (await page.locator('#results-list').textContent()) ?? '';
  const m = text.match(/(\d{3,4})×(\d{3,4})/);
  expect(m, `no size in "${text}"`).not.toBeNull();
  return Math.max(Number(m![1]), Number(m![2]));
}

for (const tool of tools) {
  test.describe(tool.name, () => {
    test.skip(({ browserName }) => browserName === 'webkit', 'the 4K reverse and merge runs take minutes in macOS WebKit');
    test('the encoder gives up at full size: the file is made at a smaller size and says so', async ({ page }) => {
      test.setTimeout(240_000);
      await breakEncoder(page, 'EncodingError', 1);
      await run(page, tool);
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
      await expect(page.locator('#results-list')).toContainText('made at a smaller size');
      expect(await longestSide(page)).toBe(1920);
      expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBe('1920');
    });

    test('the page hidden mid-run: the run starts again when it is back, at full size, and writes no size', async ({ page }) => {
      test.setTimeout(240_000);
      await breakEncoder(page, 'AbortError', 1, true);
      await run(page, tool);
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
      await expect(page.locator('#results-list')).toContainText('started again after the page was hidden');
      expect(await longestSide(page)).toBe(3840);
      expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
    });

    test('the encoder refuses at every size: one error, with its class name and plain words', async ({ page }) => {
      test.setTimeout(240_000);
      await breakEncoder(page, 'EncodingError', 1000);
      await run(page, tool);
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
      await expect(page.locator('#error')).toContainText(/even after trying again/);
      expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
    });

    test('a run that works at full size writes no size', async ({ page }) => {
      test.setTimeout(240_000);
      await run(page, tool);
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
      expect(await longestSide(page)).toBe(3840);
      expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
    });
  });
}

test('the size that worked is remembered for the tab: the next run starts there, says so, and "Try full size" clears it', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'the 4K reverse and merge runs take minutes in macOS WebKit');
  test.setTimeout(480_000);
  // The encoder fails once at full size (1080p) and works at the next size down.
  await breakEncoder(page, 'EncodingError', 1);
  await run(page, { ...tools[0]!, files: [hd] });
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  expect(await longestSide(page)).toBe(1280);
  expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBe('1280');

  // A different tool in the same tab starts at 1280 and says why.
  await page.goto('/tools/merge-videos');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#working-size-note')).toContainText('720p');
  await page.locator('#file-input').setInputFiles([hd, small]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  expect(await longestSide(page)).toBe(1280);
  await expect(page.locator('#results-list')).toContainText('made at 720p because the full size failed on this device');

  // A new tab starts at full size.
  const fresh = await context.newPage();
  await fresh.goto('/tools/reverse-video');
  await expect(fresh.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(fresh.locator('#working-size-note')).toBeHidden();
  expect(await fresh.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
  await fresh.close();

  // "Try full size" clears it, and the next run is full size again.
  await page.goto('/tools/reverse-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Try full size' }).click();
  await expect(page.locator('#working-size-note')).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
  await page.locator('#file-input').setInputFiles([hd]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  expect(await longestSide(page)).toBe(1920);
});

// The other re-encoding tools run through the same shared runner (src/lib/video-run.ts): one case each for a forced EncodingError,
// a hide variant for three of them, the remembered size for three, and a run where every encode fails and the class name is what gets recorded.
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const jfk = fixture('jfk.wav');
const loopUhd = fixture('loop-mp3-uhd.mov');
const uhdVp9 = fixture('uhd-vp9.webm');
const wideGif = fixture('wide-flat.gif');
const photos = [fixture('frenchie.jpg'), fixture('face.jpg')];

// Linux WebKit in CI stalls decoding video in the page (see the repo's notes); these run on macOS WebKit and on Chromium everywhere.
test.skip(({ browserName }) => browserName === 'webkit' && !!process.env.CI, 'Linux WebKit in CI cannot decode video in the page');

// `fails`: Mediabunny's Conversion tries its encoder on the first frame and quietly redraws when that throws, so a conversion-based tool
// needs two forced failures before one reaches the run. `uhdOnly`: the input is a 4K VP9 file, which Playwright's WebKit cannot decode.
type Rolled = Tool & { full?: number; smaller?: number; fails?: number; uhdOnly?: boolean };
const rolled: Rolled[] = [
  { name: 'video-speed', url: '/tools/video-speed', files: [uhd], full: 3840 },
  { name: 'repeat-video (re-encoded)', url: '/tools/repeat-video', files: [loopUhd], full: 3840 },
  { name: 'side-by-side-video', url: '/tools/side-by-side-video', files: [uhd, small] },
  { name: 'video-to-mp4', fails: 2, uhdOnly: true, url: '/tools/video-to-mp4', files: [uhdVp9], full: 3840 },
  { name: 'video-to-mov', fails: 2, uhdOnly: true, url: '/tools/video-to-mov', files: [uhdVp9], full: 3840 },
  { name: 'video-to-avi', fails: 2, prepare: (page) => page.locator('#compat').uncheck(), url: '/tools/video-to-avi', files: [uhd], full: 3840 },
  { name: 'video-to-webm', fails: 2, url: '/tools/video-to-webm', files: [uhd], full: 3840 },
  { name: 'gif-to-mp4', url: '/tools/gif-to-mp4', files: [wideGif], full: 1920, smaller: 1280 },
  { name: 'audio-to-video', url: '/tools/audio-to-video', files: [jfk], full: 1920, smaller: 1280 },
  { name: 'photo-slideshow-maker', url: '/tools/photo-slideshow-maker', files: photos, full: 1920, smaller: 1280 },
];

/**
 * What this browser runs. Playwright's WebKit cannot decode the 4K H.264 clip, so it gets the 1080p one (and the first rung there is the same
 * size in real-time mode, so it takes as many forced failures again to reach the smaller size); the 4K VP9 conversions are skipped there.
 */
function forBrowser(tool: Rolled, browserName: string): (Rolled & { failures: number }) | undefined {
  if (browserName !== 'webkit') return { ...tool, failures: tool.fails ?? 1 };
  if (tool.uhdOnly) return undefined;
  const uhdFull = tool.full === 3840;
  return {
    ...tool,
    files: tool.files.map((f) => (f === uhd ? hd : f)),
    full: uhdFull && tool.files.includes(uhd) ? 1920 : tool.full,
    smaller: uhdFull && tool.files.includes(uhd) ? 1280 : tool.smaller,
    failures: (tool.fails ?? 1) * 2,
  };
}

for (const base of rolled) {
  test(`${base.name}: the encoder gives up once at full size: the file is made at a smaller size and says so`, async ({ page, browserName }) => {
    const tool = forBrowser(base, browserName);
    test.skip(!tool, 'the 4K VP9 input cannot be decoded in this browser');
    test.setTimeout(240_000);
    await breakEncoder(page, 'EncodingError', tool!.failures);
    await run(page, tool!);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#results-list')).toContainText('made at a smaller size');
    const side = await longestSide(page);
    expect(side).toBeLessThanOrEqual(1920);
    if (tool!.smaller) expect(side).toBe(tool!.smaller);
    expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBe(String(side === 1280 ? 1280 : 1920));
  });
}

for (const base of rolled.filter((t) => ['video-speed', 'gif-to-mp4', 'audio-to-video'].includes(t.name))) {
  test(`${base.name}: the page hidden mid-run starts the run again when it is back, at full size, and writes no size`, async ({ page, browserName }) => {
    const tool = forBrowser(base, browserName)!;
    test.setTimeout(240_000);
    await breakEncoder(page, 'AbortError', 1, true);
    await run(page, tool);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#results-list')).toContainText('started again after the page was hidden');
    expect(await longestSide(page)).toBe(tool.full);
    expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
  });
}

for (const base of rolled.filter((t) => ['video-speed', 'audio-to-video', 'video-to-webm'].includes(t.name))) {
  test(`${base.name}: a size that worked is remembered, the next run starts there and says so`, async ({ page, browserName }) => {
    const tool = forBrowser(base, browserName)!;
    test.setTimeout(480_000);
    await breakEncoder(page, 'EncodingError', tool.failures);
    await run(page, tool);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    const first = await longestSide(page);
    expect(first).toBeLessThanOrEqual(1920);
    // The same tool again in this tab: the encoder works now, and the run starts at the size that worked.
    await page.goto(tool.url);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#working-size-note')).toBeVisible();
    await page.locator('#file-input').setInputFiles(tool.files);
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    expect(await longestSide(page)).toBe(first);
    await expect(page.locator('#results-list')).toContainText('because the full size failed on this device');
    // "Try full size" goes back to the full size.
    await page.goto(tool.url);
    await page.getByRole('button', { name: 'Try full size' }).click();
    await expect(page.locator('#working-size-note')).toBeHidden();
    await page.locator('#file-input').setInputFiles(tool.files);
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    expect(await longestSide(page)).toBe(tool.full);
  });
}

// What a failed run sends: the class name only. The tracker is the real one, fed from a local copy.
const TRACKER = readFileSync(fileURLToPath(new URL('./vendor/umami-st.js', import.meta.url)), 'utf8');
for (const base of rolled.filter((t) => ['video-speed', 'gif-to-mp4', 'photo-slideshow-maker', 'side-by-side-video'].includes(t.name))) {
  test(`${base.name}: when every encode fails, one error is shown and tool_run records the class EncoderGaveUp (never a bare Error)`, async ({ page, baseURL, browserName }) => {
    const tool = forBrowser(base, browserName)!;
    test.skip(!!process.env.PW_LIVE, 'needs the local build and the real tracker');
    test.setTimeout(300_000);
    const sent: { payload: { name?: string; data?: Record<string, unknown> } }[] = [];
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
    await page.route('https://stayput.dev/**', async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace('https://stayput.dev', baseURL!) }) }));
    await page.route('https://stats.keenankaufman.com/st.js', (route) => route.fulfill({ contentType: 'text/javascript', body: TRACKER }));
    await page.route('https://stats.keenankaufman.com/api/st', (route) => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: '{"cache":"test-token"}' });
    });
    await breakEncoder(page, 'EncodingError', 1000);
    await page.goto(`https://stayput.dev${tool.url}`);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(tool.files);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 250_000 });
    await expect(page.locator('#error')).toContainText(/even after trying again/);
    await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBe(1);
    const data = sent.find((s) => s.payload.name === 'tool_run')!.payload.data!;
    expect(data).toMatchObject({ outcome: 'error', error_class: 'EncoderGaveUp' });
    expect(['Error', 'TypeError', 'RangeError']).not.toContain(data.error_class);
  });
}
