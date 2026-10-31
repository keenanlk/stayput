// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withoutSoftwareEncoder } from './no-software-encoder';

// Burned-in captions need the browser's H.264 encoder to answer. Safari/WebKit's can go silent with
// the settings Mediabunny picks first; the page must then use settings that work, or say so at once
// and link to Video to subtitles. Runs in the chromium project and in the webkit project (CI).
const clip = fileURLToPath(new URL('./fixtures/static/clip.webm', import.meta.url));

function srtFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'clip.srt');
  writeFileSync(file, '1\n00:00:00,000 --> 00:00:01,500\nHello from the park\n');
  return file;
}

async function open(page: Page) {
  await page.goto('/auto-caption-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

test('burned-in captions finish here and give a playable mp4', async ({ page }, info) => {
  test.setTimeout(120_000);
  await open(page);
  const download = page.waitForEvent('download');
  await page.locator('#file-input').setInputFiles([clip, srtFile()]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const path = await (await download).path();
  expect(path).toBeTruthy();
  info.annotations.push({ type: 'browser', description: info.project.name });
});

// iPhone camera files are QuickTime .mov, which iPhone Safari's decodeAudioData refuses whole; the sound is read through the demuxer instead.
test('captions are written from the speech in a QuickTime .mov, where Safari cannot decode the file whole', async ({ page }, info) => {
  // CI's Chromium cannot decode AAC at all, so this one is for WebKit (and a desktop Chrome with AAC).
  test.skip(info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
  test.setTimeout(180_000);
  await open(page);
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('./fixtures/static/speech.mov', import.meta.url)));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect(page.locator('#results-list')).toContainText(/written from English speech/);
});

test('an encoder that never answers is caught at once, with a plain message and a link, before any transcribing', async ({ page }) => {
  await page.addInitScript(() => {
    const Real = window.VideoEncoder;
    class Silent {
      static isConfigSupported(config: VideoEncoderConfig) {
        return Real.isConfigSupported(config);
      }
      state = 'unconfigured';
      encodeQueueSize = 0;
      ondequeue: unknown = null;
      configure() {
        this.state = 'configured';
      }
      encode() {}
      flush() {
        return new Promise<void>(() => undefined);
      }
      reset() {}
      close() {
        this.state = 'closed';
      }
      addEventListener() {}
    }
    (window as unknown as { VideoEncoder: unknown }).VideoEncoder = Silent;
  });
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await open(page);
  // No subtitle file, so a working page would start transcribing (and downloading the speech model).
  await page.locator('#file-input').setInputFiles([clip]);
  const started = Date.now();
  await page.locator('#run').click();
  const error = page.locator('#error');
  await expect(error).toHaveClass(/is-active/, { timeout: 20_000 });
  expect(Date.now() - started).toBeLessThan(15_000);
  await expect(error).toContainText("Burned-in captions don't work in this browser yet");
  await expect(error).not.toContainText('EncoderStall');
  await expect(error).not.toContainText('stopped responding');
  const link = error.locator('a');
  await expect(link).toHaveAttribute('href', '/video-to-subtitles');
  expect(requested.filter((u) => /onnx|whisper|huggingface|\.bin(\?|$)/i.test(u))).toEqual([]);
  await link.click();
  await expect(page).toHaveURL(/\/video-to-subtitles$/);
});

// The redraw can run out of memory long after the captions were written (the whole file is built in memory).
// The captions must survive it: a plain message, the .srt to download, and a named error kind, not the raw message.
test('a redraw that runs out of memory keeps the written subtitles and says so plainly', async ({ page }, info) => {
  // The fixture's Opus sound track is not decodable in Linux WebKit; the error path is the same code in every browser.
  test.skip(info.project.name === 'webkit', 'the webm sound track is decoded in Chromium only here');
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __explode?: boolean };
    const real = VideoEncoder.prototype.encode;
    VideoEncoder.prototype.encode = function (...args: Parameters<VideoEncoder['encode']>) {
      if (w.__explode) throw new RangeError('Array buffer allocation failed');
      return real.apply(this, args);
    };
    // Break the encode only once the captions exist and the redraw has begun.
    new MutationObserver(() => {
      if (document.getElementById('progress-text')?.textContent?.startsWith('Adding subtitles')) w.__explode = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
    // The site skips analytics in automated browsers; pretend to be a person so the stub below loads.
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
  });
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
  await open(page);
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('./fixtures/static/talk.webm', import.meta.url)));
  await page.locator('#run').click();
  const error = page.locator('#error');
  await expect(error).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(error).toContainText('too long for your browser to redraw with captions');
  await expect(error).not.toContainText('allocation');
  await expect(error).not.toContainText('RangeError');
  await expect(page.locator('#results')).toHaveClass(/is-active/);
  const download = page.waitForEvent('download');
  await page.locator('#results-list button', { hasText: 'Download' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.srt$/);
  const runs = (await page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[])).filter((e) => e.n === 'tool_run');
  expect(runs.at(-1)!.d.error_class).toBe('OutOfMemoryError');
});

// A phone's Safari reports running out of memory in ways nothing recognises (an EncodingError "Unknown error", a
// worker that just stops). With a phone UA and a video past the phone limit, the page must still say so, keep the
// SRT it already wrote, and not hold the speech model's worker afterwards. The speech worker is a stand-in here.
test.describe('on a phone, with a video over the phone limit', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1', hasTouch: true });
  const talk = fileURLToPath(new URL('./fixtures/static/talk.webm', import.meta.url));

  async function stub(page: Page, speech: 'ok' | 'unnamed' | 'dies', encode: 'ok' | 'unknown-encoding-error') {
    await page.addInitScript(
      ([speechMode, encodeMode]) => {
        const w = window as unknown as { __created: number; __terminated: number; __explode?: boolean; __big?: boolean; __thrown?: boolean };
        w.__created = 0;
        w.__terminated = 0;
        // 250 MB as far as the page can tell, from the moment the stand-in fails: the real size is what the file is read with.
        const realSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!;
        Object.defineProperty(Blob.prototype, 'size', { get() { return w.__big && this instanceof File && this.name === 'talk.webm' ? 250_000_000 : realSize.call(this); } });
        const Real = window.Worker;
        class FakeWorker extends EventTarget {
          constructor() {
            super();
            w.__created++;
          }
          postMessage(msg: { id: number }) {
            setTimeout(() => {
              if (speechMode !== 'ok') w.__big = true;
              if (speechMode === 'dies') return this.dispatchEvent(new Event('error'));
              if (speechMode === 'unnamed') return this.dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'error', name: 'Mystery', message: 'x' } }));
              if (encodeMode !== 'ok') w.__explode = true;
              this.dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'result', chunks: [{ start: 0, end: 1.5, text: 'Hello from the park' }], language: 'en' } }));
            }, 10);
          }
          terminate() {
            w.__terminated++;
          }
        }
        (window as unknown as { Worker: unknown }).Worker = function (url: string | URL, opts?: WorkerOptions) {
          return /transcribe/.test(String(url)) ? new FakeWorker() : new Real(url, opts);
        };
        const encodeReal = VideoEncoder.prototype.encode;
        VideoEncoder.prototype.encode = function (...args: Parameters<VideoEncoder['encode']>) {
          if (w.__explode) {
            // The size reads big on the first failure only: frames still in flight must not change it after a reset.
            w.__big ||= !w.__thrown;
            w.__thrown = true;
            throw new DOMException('Unknown error', 'EncodingError');
          }
          return encodeReal.apply(this, args);
        };
        Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
      },
      [speech, encode] as const,
    );
    await page.route('https://stats.keenankaufman.com/**', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
      }),
    );
  }
  const workers = (page: Page) => page.evaluate(() => ({ created: (window as never as { __created: number }).__created, terminated: (window as never as { __terminated: number }).__terminated }));
  const lastErrorClass = (page: Page) =>
    page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)!.d.error_class);

  test('an EncodingError while redrawing says the phone ran out of memory, offers the SRT, and frees the worker', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'Chromium decodes this clip’s sound; the worker is a stand-in');
    test.setTimeout(120_000);
    await withoutSoftwareEncoder(page);
    await stub(page, 'ok', 'unknown-encoding-error');
    await open(page);
    await page.locator('#file-input').setInputFiles(talk);
    await page.locator('#run').click();
    const error = page.locator('#error');
    await expect(error).toHaveClass(/is-active/, { timeout: 90_000 });
    await expect(error).toContainText('too long for your browser to redraw with captions');
    await expect(error).toContainText('Your subtitles are ready');
    await expect(page.locator('#results')).toHaveClass(/is-active/);
    const download = page.waitForEvent('download');
    await page.locator('#results-list button', { hasText: 'Download' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.srt$/);
    // The speech worker is gone, a class name is all that is recorded, and Clear says to reload.
    await expect.poll(() => workers(page)).toEqual({ created: 1, terminated: 1 });
    expect(await lastErrorClass(page)).toBe('EncoderGaveUp');
    await page.locator('#clear').click();
    await expect(page.locator('#results')).not.toHaveClass(/is-active/);
    await expect(page.locator('#run-hint')).toContainText('Reload the page');
    // The next run starts a fresh worker (the stand-in stops reporting a big file, so the file can be read).
    await page.evaluate(() => Object.assign(window, { __big: false }));
    await page.locator('#file-input').setInputFiles(talk);
    await page.locator('#run').click();
    await expect(error).toHaveClass(/is-active/, { timeout: 90_000 });
    await expect.poll(() => workers(page)).toEqual({ created: 2, terminated: 2 });
  });

  test('an unnamed error from the speech step says out of memory, with no subtitles claimed, and frees the worker', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'Chromium decodes this clip’s sound; the worker is a stand-in');
    test.setTimeout(120_000);
    await stub(page, 'unnamed', 'ok');
    await open(page);
    await page.locator('#file-input').setInputFiles(talk);
    await page.locator('#run').click();
    const error = page.locator('#error');
    await expect(error).toHaveClass(/is-active/, { timeout: 90_000 });
    await expect(error).toContainText('ran out of memory');
    await expect(error).toContainText('Trim the video');
    await expect(error).not.toContainText('Something went wrong');
    await expect(error).not.toContainText('subtitles are ready');
    await expect(page.locator('#results')).not.toHaveClass(/is-active/);
    await expect.poll(() => workers(page)).toEqual({ created: 1, terminated: 1 });
  });

  test('a worker that dies in the speech step is the same out-of-memory message', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'Chromium decodes this clip’s sound; the worker is a stand-in');
    test.setTimeout(120_000);
    await stub(page, 'dies', 'ok');
    await open(page);
    await page.locator('#file-input').setInputFiles(talk);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toContainText('Trim the video', { timeout: 90_000 });
    // A worker that dies as the model starts is replaced once (a second one that dies too is the answer); both are stopped.
    await expect.poll(() => workers(page)).toEqual({ created: 2, terminated: 2 });
  });
});
