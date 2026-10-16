// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Burn subtitles into video: the failures that come from the device or the file's reading, not the tool, and the
 * name each one is recorded under. The page hiding, the encoder stalling and the phone failing to read a file are
 * forced by hand; a real phone doing them cannot be reproduced here. clip.webm is a short video with no sound.
 */
const clip = fileURLToPath(new URL('./fixtures/static/clip.webm', import.meta.url));

function srtFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'clip.srt');
  writeFileSync(file, '1\n00:00:00,000 --> 00:00:01,500\nHello from the park\n');
  return file;
}

/** The site skips analytics in automated browsers; pretend to be a person and record what would be sent. */
async function recordRuns(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}
const lastRun = (page: Page) =>
  page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)!.d);

async function start(page: Page, files: string[]) {
  await page.goto('/burn-subtitles-into-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(files);
  await page.locator('#run').click();
}

/** Once the progress line matches `phase`, the encoder throws `name` (every time, or the first time only), and the page can be hidden for a moment. */
async function breakEncoder(page: Page, opts: { name: string; times: number; hide?: boolean }) {
  await page.addInitScript((opts) => {
    const w = window as unknown as { __thrown: number; __modes: string[] };
    w.__thrown = 0;
    w.__modes = [];
    const configure = VideoEncoder.prototype.configure;
    VideoEncoder.prototype.configure = function (this: VideoEncoder, config: VideoEncoderConfig) {
      w.__modes.push(String(config.latencyMode));
      return configure.call(this, config);
    };
    const original = VideoEncoder.prototype.encode;
    VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
      const running = /Adding subtitles to/.test(document.getElementById('progress-text')?.textContent ?? '');
      if (running && w.__thrown < opts.times) {
        w.__thrown++;
        if (opts.hide) {
          const set = (hidden: boolean) => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
            document.dispatchEvent(new Event('visibilitychange'));
          };
          set(true);
          setTimeout(() => set(false), 600);
        }
        throw Object.assign(new Error('forced by the test'), { name: opts.name });
      }
      return original.apply(this, args);
    };
  }, opts);
}

/**
 * Reading the file fails with NotReadableError `times` times (a large number: always), starting at the `from`th read of
 * the file's bytes. Chromium reads a file through Blob.stream(): the first read is the check that the video decodes
 * before anything slow starts, the second is the redraw (or, with no subtitle file, the reading of the sound).
 */
async function breakReads(page: Page, from: number, times: number) {
  await page.addInitScript(
    ([from, times]) => {
      const w = window as unknown as { __reads: number; __unread: number };
      w.__reads = 0;
      w.__unread = 0;
      const stream = Blob.prototype.stream;
      Blob.prototype.stream = function (this: Blob) {
        if (++w.__reads < (from as number) || w.__unread >= (times as number)) return stream.call(this);
        w.__unread++;
        return new ReadableStream({ start: (c) => c.error(new DOMException('The requested file could not be read', 'NotReadableError')) });
      };
    },
    [from, times] as const,
  );
}

test('the page hidden during the redraw: it starts again once when the page is back and finishes', async ({ page }) => {
  test.setTimeout(90_000);
  await recordRuns(page);
  await breakEncoder(page, { name: 'InvalidStateError', times: 1, hide: true });
  await start(page, [clip, srtFile()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect(page.locator('#results-list')).toContainText('started again after the page was hidden');
  await expect(page.locator('#results-list')).toContainText('1 caption');
  expect(await page.evaluate(() => (window as never as { __thrown: number }).__thrown)).toBe(1);
});

test('an encoder stall is tried once more, in real-time mode, and the run finishes', async ({ page }) => {
  test.setTimeout(90_000);
  await recordRuns(page);
  await breakEncoder(page, { name: 'EncoderStall', times: 1 });
  await start(page, [clip, srtFile()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#results-list')).toContainText('made on a second try');
  const modes = await page.evaluate(() => (window as never as { __modes: string[] }).__modes);
  expect(modes.at(-1)).toBe('realtime');
});

test('an encoder that stalls again is reported as EncoderStall after exactly one more try', async ({ page }) => {
  test.setTimeout(90_000);
  await recordRuns(page);
  await breakEncoder(page, { name: 'EncoderStall', times: 99 });
  await start(page, [clip, srtFile()]);
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect(await page.evaluate(() => (window as never as { __thrown: number }).__thrown)).toBe(2);
  expect((await lastRun(page)).error_class).toBe('EncoderStall');
});

test('a file the phone fails to read once is read again, and the redraw finishes', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'WebKit reads files with arrayBuffer(), so the read to fail is a different one');
  test.setTimeout(90_000);
  await recordRuns(page);
  await breakReads(page, 2, 1);
  await start(page, [clip, srtFile()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  expect(await page.evaluate(() => (window as never as { __unread: number }).__unread)).toBe(1);
});

test('a file that still cannot be read is NotReadableError, never an encoder or memory failure', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'WebKit reads files with arrayBuffer(), so the read to fail is a different one');
  test.setTimeout(90_000);
  await recordRuns(page);
  await breakReads(page, 2, 1000);
  await start(page, [clip, srtFile()]);
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText('could not be read');
  await expect(page.locator('#error')).not.toContainText(/memory|encoder/i);
  expect((await lastRun(page)).error_class).toBe('NotReadableError');
});

test('writing captions from the speech of a file the phone cannot read says so, not "no sound"', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'WebKit reads files with arrayBuffer(), so the read to fail is a different one');
  test.setTimeout(90_000);
  await recordRuns(page);
  await breakReads(page, 2, 1000);
  await start(page, [fileURLToPath(new URL('./fixtures/static/talk.webm', import.meta.url))]);
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText('could not be read');
  await expect(page.locator('#error')).not.toContainText(/no sound track|No audio/i);
  const errorClass = (await lastRun(page)).error_class;
  expect(errorClass).toBe('NotReadableError');
  expect(['AudioDecodeError', 'NoSoundTrack']).not.toContain(errorClass);
});

test('a video with no sound and no subtitle file gets a plain message under its own name', async ({ page }) => {
  test.setTimeout(90_000);
  await recordRuns(page);
  await start(page, [clip]);
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText('No sound track was found');
  expect((await lastRun(page)).error_class).toBe('NoSoundTrack');
});
