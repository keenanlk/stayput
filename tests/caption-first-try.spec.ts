// @webkit-project
import { test, expect, devices, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The caption redraw (burn subtitles into video, add subtitles to video, auto caption video) on a phone: full size stays the default,
 * a 4K source starts at 1080p on a phone (720p with 3 GB of memory or less), a tab the browser closed mid-run starts at 720p, and every
 * smaller result says so and offers "Try full size". Nothing new is sent. The SRT is given, so no speech model is involved.
 */
const here = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const uhd = here('uhd-flat.mp4');
const uhdRotated = here('uhd-flat-rot90.mp4');
const hd = here('hd-flat.mp4');
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via', 'variant']);

const srt = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'jfk.srt');
writeFileSync(srt, '1\n00:00:00,500 --> 00:00:10,000\nAnd so, my fellow Americans\n');

const { defaultBrowserType: _a, ...iPhone } = devices['iPhone 15'];
const { defaultBrowserType: _b, ...pixel } = devices['Pixel 7'];

type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

async function recordEvents(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

async function open(page: Page, path = '/burn-subtitles-into-video') {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

/** Runs the redraw and returns the result's text and the longest side of the picture it names (WxH). */
async function burn(page: Page, video: string): Promise<{ text: string; side: number; width: number; height: number }> {
  await page.locator('#file-input').setInputFiles([video, srt]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 240_000 });
  const text = (await page.locator('#results-list').textContent()) ?? '';
  const m = text.match(/(\d{3,4})×(\d{3,4})/);
  const [width, height] = [Number(m?.[1]), Number(m?.[2])];
  return { text, side: Math.max(width, height), width, height };
}

const again = async (page: Page) => {
  await page.locator('#clear').click();
};

test.skip(({ browserName }) => browserName === 'webkit' && !!process.env.CI && process.platform === 'linux', 'WebKit on Linux CI stalls decoding video; run on macOS');

test.describe('iPhone', () => {
  test.use(iPhone);

  test('a 4K source starts at 1080p, says so, and Try full size is there; pressing it gives full size next run', async ({ page }) => {
    test.setTimeout(300_000);
    await open(page);
    const r = await burn(page, uhd);
    expect(r.side).toBe(1920);
    expect(r.text).toContain('made at 1080p because 4K is heavy for this device; use Try full size to keep 4K');
    const full = page.locator('#working-size-note button', { hasText: 'Try full size' });
    await expect(full).toBeVisible();
    await full.click();
    await again(page);
    const second = await burn(page, uhd);
    expect(second.side).toBe(3840);
    expect(second.text).not.toContain('Try full size');
  });

  test('a 1080p source stays at full size with no note', async ({ page }) => {
    test.setTimeout(300_000);
    await open(page);
    const r = await burn(page, hd);
    expect(r.side).toBe(1920);
    expect(r.text).not.toMatch(/made at|Try full size/);
  });

  test('a portrait 4K clip with rotation metadata is capped by its shown longest side, not squashed', async ({ page }) => {
    test.setTimeout(300_000);
    await open(page);
    const r = await burn(page, uhdRotated);
    expect(r.height).toBe(1920);
    expect(r.width).toBe(1080);
    expect(r.text).toContain('made at 1080p because 4K is heavy');
  });

  test('after the browser closed the page mid-run: 720p, the new note and hint, one existing event, and Try full size clears it', async ({ page }) => {
    test.setTimeout(300_000);
    await recordEvents(page);
    await open(page);
    // The marker a killed tab leaves behind (see inflight.ts), then a reload.
    await page.evaluate(() => sessionStorage.setItem('stayput:inflight', JSON.stringify({ tool: 'burn-subtitles-into-video', phase: 'run', t: Date.now(), hidden: false })));
    await page.reload();
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    const hint = page.locator('#working-size-note');
    await expect(hint).toContainText('The last run stopped because the browser closed this page, most likely out of memory. In this tab, videos are now made at 720p so the next run is lighter. If you only need the subtitle file, use Video to subtitles.');
    await expect(hint.locator('a')).toHaveAttribute('href', '/video-to-subtitles');
    const lost = (await events(page)).filter((e) => e.d.error_class);
    expect(lost.map((e) => e.d.error_class)).toEqual(['TabLostDuringRun']);
    for (const e of await events(page)) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);

    const r = await burn(page, hd);
    expect(r.side).toBe(1280);
    expect(r.text).toContain('made at 720p because the browser closed this page during the last run, most likely out of memory; use Try full size to keep the original size');
    expect((await events(page)).filter((e) => e.d.error_class).map((e) => e.d.error_class)).toEqual(['TabLostDuringRun']);

    await page.locator('#working-size-note button', { hasText: 'Try full size' }).click();
    await again(page);
    const full = await burn(page, hd);
    expect(full.side).toBe(1920);
    expect(full.text).not.toContain('Try full size');
  });

  test('a lost run in another tool does not change the caption redraw', async ({ page }) => {
    test.setTimeout(300_000);
    await open(page);
    await page.evaluate(() => sessionStorage.setItem('stayput:inflight', JSON.stringify({ tool: 'compress-video', phase: 'run', t: Date.now(), hidden: false })));
    await page.reload();
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#working-size-note')).toBeHidden();
    expect((await burn(page, hd)).side).toBe(1920);
  });
});

test.describe('Android', () => {
  test.use(pixel);

  test('3 GB of memory or less: a 4K source starts at 720p and the note says 720p', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { value: 3, configurable: true }));
    await open(page);
    const r = await burn(page, uhd);
    expect(r.side).toBe(1280);
    expect(r.text).toContain('made at 720p because 4K is heavy for this device; use Try full size to keep 4K');
    await expect(page.locator('#working-size-note button', { hasText: 'Try full size' })).toBeVisible();
  });

  test('4 GB of memory: 1080p', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true }));
    await open(page);
    const r = await burn(page, uhd);
    expect(r.side).toBe(1920);
    expect(r.text).toContain('made at 1080p because 4K is heavy');
  });
});

test('a computer keeps full size for a 4K source, with no note', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  const r = await burn(page, uhd);
  expect(r.side).toBe(3840);
  expect(r.text).not.toMatch(/made at|Try full size/);
  await expect(page.locator('#working-size-note')).toBeHidden();
});

test('on a phone, an encoder that fails at the capped size still steps down the ladder (1920, then 1280)', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36', configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    const original = VideoEncoder.prototype.configure;
    VideoEncoder.prototype.configure = function (this: VideoEncoder, config: VideoEncoderConfig) {
      if (Math.max(config.width, config.height) > 1280) throw new DOMException('forced by the test', 'EncodingError');
      return original.call(this, config);
    };
  });
  await open(page);
  const r = await burn(page, uhd);
  expect(r.side).toBeLessThanOrEqual(1280);
  expect(r.text).toMatch(/made at (720p|480p)/);
});
