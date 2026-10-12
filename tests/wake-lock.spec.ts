import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A long video job holds the screen on, and a run that failed after the page was hidden (or with a codec the
// browser took back) says so instead of the generic failure. The speech worker and the encoder are stand-ins.
const clip = fileURLToPath(new URL('./fixtures/static/clip.webm', import.meta.url));
// Chromium here decodes the webm's Opus sound; WebKit decodes the .mov's AAC (through the demuxer, as iPhone Safari does).
const talkFor = (project: string) => fileURLToPath(new URL(project === 'webkit' ? './fixtures/static/speech.mov' : './fixtures/static/talk.webm', import.meta.url));
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

function srtFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'clip.srt');
  writeFileSync(file, '1\n00:00:00,000 --> 00:00:01,500\nHello from the park\n');
  return file;
}

type Lock = { requests: number; releases: number };

/** Stub navigator.wakeLock; 'missing' removes it, 'denied' makes request() reject. */
async function stubWakeLock(page: Page, mode: 'ok' | 'missing' | 'denied') {
  await page.addInitScript((m) => {
    const w = window as unknown as { __lock: { requests: number; releases: number } };
    w.__lock = { requests: 0, releases: 0 };
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    if (m === 'missing') {
      Object.defineProperty(Navigator.prototype, 'wakeLock', { get: () => undefined, configurable: true });
      return;
    }
    const sentinels: { released: boolean }[] = [];
    Object.defineProperty(Navigator.prototype, 'wakeLock', {
      configurable: true,
      get: () => ({
        request: async () => {
          w.__lock.requests++;
          if (m === 'denied') throw new DOMException('Not allowed', 'NotAllowedError');
          const s = { released: false, release: async () => { s.released = true; w.__lock.releases++; } };
          sentinels.push(s);
          return s;
        },
      }),
    });
    // The system takes the lock back when the page is hidden.
    (window as unknown as { __hide: () => void }).__hide = () => sentinels.forEach((s) => (s.released = true));
  }, mode);
}

/** Hide the page and bring it back, as a locked screen does, from inside the page. */
const FLIP = `
  const setState = (v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); };
`;

async function open(page: Page) {
  await page.goto('/auto-caption-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}
const lock = (page: Page) => page.evaluate(() => (window as never as { __lock: Lock }).__lock);
const lastErrorClass = (page: Page) => page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)!.d.error_class);

async function statsStub(page: Page) {
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}

test.describe('screen wake lock', () => {
  test('is requested at the start, asked for again on return, and released when the run ends', async ({ page }) => {
    test.setTimeout(120_000);
    await stubWakeLock(page, 'ok');
    // Once the redraw begins, hide the page and bring it back.
    await page.addInitScript(`${FLIP}
      let flipped = false;
      new MutationObserver(() => {
        if (!flipped && document.getElementById('progress-text')?.textContent?.startsWith('Adding subtitles')) {
          flipped = true;
          window.__hide();
          setState('hidden');
          setState('visible');
        }
      }).observe(document, { subtree: true, childList: true, characterData: true });`);
    await open(page);
    await page.locator('#file-input').setInputFiles([clip, srtFile()]);
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 100_000 });
    // Hiding the page did not fail a run that went on to finish.
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    const l = await lock(page);
    expect(l.requests).toBe(2);
    expect(l.releases).toBeGreaterThanOrEqual(1);
  });

  test('is let go when the run fails', async ({ page }) => {
    test.setTimeout(120_000);
    await stubWakeLock(page, 'ok');
    await page.addInitScript(() => {
      VideoEncoder.prototype.encode = function () {
        throw new DOMException('Unknown error', 'EncodingError');
      };
    });
    await open(page);
    await page.locator('#file-input').setInputFiles([clip, srtFile()]);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 100_000 });
    expect(await lock(page)).toEqual({ requests: 1, releases: 1 });
  });

  test('is let go at Clear, even while the run is still going', async ({ page }) => {
    test.setTimeout(120_000);
    await stubWakeLock(page, 'ok');
    // An encoder that never finishes, so the run is still going when Clear is pressed.
    await page.addInitScript(() => {
      // Only once the redraw has begun: the encoder probe flushes too.
      const real = VideoEncoder.prototype.flush;
      VideoEncoder.prototype.flush = function () {
        return document.getElementById('progress-text')?.textContent?.startsWith('Adding subtitles') ? new Promise<void>(() => {}) : real.call(this);
      };
    });
    await open(page);
    await page.locator('#file-input').setInputFiles([clip, srtFile()]);
    await page.locator('#run').click();
    await expect(page.locator('#progress-text')).toContainText('Adding subtitles', { timeout: 60_000 });
    expect(await lock(page)).toEqual({ requests: 1, releases: 0 });
    await page.locator('#clear').click();
    await expect.poll(() => lock(page)).toEqual({ requests: 1, releases: 1 });
  });

  for (const mode of ['missing', 'denied'] as const) {
    test(`a ${mode} wake lock changes nothing and logs no error`, async ({ page }) => {
      test.setTimeout(120_000);
      const noise: string[] = [];
      page.on('pageerror', (e) => noise.push(e.message));
      page.on('console', (m) => m.type() === 'error' && noise.push(m.text()));
      await stubWakeLock(page, mode);
      await open(page);
      await page.locator('#file-input').setInputFiles([clip, srtFile()]);
      await page.locator('#run').click();
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 100_000 });
      await expect(page.locator('#error')).not.toHaveClass(/is-active/);
      expect(noise.filter((n) => !/stats\.keenankaufman|umami|net::ERR|Failed to load resource/i.test(n))).toEqual([]);
    });
  }
});

test.describe('a run interrupted by the screen locking', () => {
  async function stubSpeech(page: Page, after: 'hidden' | 'reclaimed') {
    await page.addInitScript((mode) => {
      const w = window as unknown as { __explode?: boolean; __recovered?: boolean };
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
      const Real = window.Worker;
      class FakeWorker extends EventTarget {
        postMessage(msg: { id: number }) {
          setTimeout(() => {
            w.__explode = true;
            this.dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'result', chunks: [{ start: 0, end: 1.5, text: 'Hello from the park' }], language: 'en' } }));
          }, 10);
        }
        terminate() {}
      }
      (window as unknown as { Worker: unknown }).Worker = function (url: string | URL, opts?: WorkerOptions) {
        return /transcribe/.test(String(url)) ? new FakeWorker() : new Real(url, opts);
      };
      const real = VideoEncoder.prototype.encode;
      VideoEncoder.prototype.encode = function (...args: Parameters<VideoEncoder['encode']>) {
        if (w.__explode && !w.__recovered) {
          if (mode === 'hidden') {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
            document.dispatchEvent(new Event('visibilitychange'));
            throw new DOMException('Unknown error', 'EncodingError');
          }
          throw new DOMException('Codec reclaimed due to inactivity.', 'QuotaExceededError');
        }
        return real.apply(this, args);
      };
    }, after);
    await statsStub(page);
  }

  for (const kind of ['hidden', 'reclaimed'] as const) {
    test(`${kind}: says the screen locked, offers the SRT, records a class name, and a second try works`, async ({ page }, info) => {
      test.setTimeout(150_000);
      await stubSpeech(page, kind);
      await open(page);
      await page.locator('#file-input').setInputFiles(talkFor(info.project.name));
      await page.locator('#run').click();
      const error = page.locator('#error');
      await expect(error).toHaveClass(/is-active/, { timeout: 100_000 });
      await expect(error).toContainText('switched tabs or the screen locked');
      await expect(error).toContainText('Keep this page open with the screen on');
      await expect(error).toContainText('Your subtitles are ready');
      await expect(error).toContainText('reload the page');
      await expect(error).not.toContainText('Something went wrong');
      await expect(error).not.toContainText('too long for your browser');
      await expect(page.locator('#results')).toHaveClass(/is-active/);
      const download = page.waitForEvent('download');
      await page.locator('#results-list button', { hasText: 'Download' }).click();
      expect((await download).suggestedFilename()).toMatch(/\.srt$/);
      expect(await lastErrorClass(page)).toBe(kind === 'hidden' ? 'PageHiddenError' : 'CodecReclaimedError');
      // No reload needed: with the encoder back, the same page finishes the same video.
      await page.evaluate(() => Object.assign(window, { __recovered: true }));
      await page.locator('#run').click();
      await expect(page.locator('#results-list')).toContainText('-subtitled', { timeout: 100_000 });
      await expect(error).not.toHaveClass(/is-active/);
    });
  }

  test('on a phone the message says phone, and the page hints to keep the screen on', async ({ browser }, info) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ userAgent: PHONE, hasTouch: true });
    const page = await ctx.newPage();
    await stubSpeech(page, 'hidden');
    await open(page);
    await expect(page.locator('#run-hint')).toContainText('Keep the screen on while it works.');
    await page.locator('#file-input').setInputFiles(talkFor(info.project.name));
    await page.locator('#run').click();
    const error = page.locator('#error');
    await expect(error).toHaveClass(/is-active/, { timeout: 100_000 });
    await expect(error).toContainText('The screen locked or you switched apps, so your phone paused the conversion.');
    await expect(error).toContainText('tap');
    await ctx.close();
  });

  test('Transcribe holds the screen on while it runs, and releases it at the end', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ userAgent: PHONE, hasTouch: true });
    const page = await ctx.newPage();
    await stubWakeLock(page, 'ok');
    // The model cannot be fetched, so the run ends quickly: the lock must still be given back.
    await page.route('**/models/**/*.onnx', (route) => route.abort('connectionreset'));
    await page.goto('/tools/transcribe');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#run-hint')).toContainText('Keep the screen on while it works.');
    await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('./fixtures/static/jfk.wav', import.meta.url)));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 100_000 });
    const l = await lock(page);
    expect(l.requests).toBeGreaterThan(0);
    expect(l.releases).toBeGreaterThan(0);
    await ctx.close();
  });

  test('a computer sees no keep-the-screen-on hint', async ({ page }) => {
    await open(page);
    await expect(page.locator('#run-hint')).not.toContainText('Keep the screen on');
  });
});
