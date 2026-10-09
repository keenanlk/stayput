import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
