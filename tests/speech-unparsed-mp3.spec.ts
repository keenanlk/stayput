// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * An MP3 with stretches that do not parse as frames (damaged in transit, a copy that went wrong). The container reader
 * drops those bytes and numbers the frames that remain one after another, so no gap shows in the timestamps: the page
 * measures what is missing from the file's bytes instead. A little gone: the result says so. Half or more gone:
 * AudioDamaged. A healthy file: no note. The speech worker is a stand-in; the corrupted files are made here from the
 * committed 12-minute recording.
 */
const MP3 = readFileSync(fileURLToPath(new URL('./fixtures/speech-12min.mp3', import.meta.url)));
const JFK = readFileSync(fileURLToPath(new URL('./fixtures/static/jfk.wav', import.meta.url)));

/** The middle `share` of the file overwritten with (seeded) random bytes. */
function corrupted(share: number): Buffer {
  const b = Buffer.from(MP3);
  const from = Math.floor(b.length * (0.5 - share / 2));
  const to = Math.floor(b.length * (0.5 + share / 2));
  let seed = 12345;
  for (let i = from; i < to; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    b[i] = (seed >> 16) & 255;
  }
  return b;
}

async function stub(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    const Real = window.Worker;
    class FakeWorker extends EventTarget {
      postMessage(msg: { id: number }) {
        setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'result', chunks: [{ start: 0, end: 1, text: 'Hello' }], language: 'en' } })), 2);
      }
      terminate() {}
    }
    (window as unknown as { Worker: unknown }).Worker = function (url: string | URL, opts?: WorkerOptions) {
      return /transcribe/.test(String(url)) ? new FakeWorker() : new Real(url, opts);
    };
  });
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}

const lastRun = (page: Page) =>
  page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)?.d);

async function run(page: Page, buffer: Buffer, name: string, mimeType: string) {
  await page.goto('/tools/transcribe');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name, mimeType, buffer });
  await page.locator('#run').click();
}

test('an MP3 with 40% unparseable bytes finishes with a note of what was left out', async ({ page }) => {
  await stub(page);
  await run(page, corrupted(0.4), 'talk.mp3', 'audio/mpeg');
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  expect((await lastRun(page))?.outcome).toBe('ok');
  await expect(page.locator('#results')).toContainText(/of the sound could not be read and was left out/);
});

test('an MP3 with 95% unparseable bytes fails as AudioDamaged', async ({ page }) => {
  await stub(page);
  await run(page, corrupted(0.95), 'talk.mp3', 'audio/mpeg');
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#error')).toContainText('damaged or cut short');
  expect((await lastRun(page))?.error_class).toBe('AudioDamaged');
});

test('healthy recordings show no note', async ({ page }) => {
  await stub(page);
  for (const [buffer, name, type] of [[MP3, 'talk.mp3', 'audio/mpeg'], [JFK, 'jfk.wav', 'audio/wav']] as const) {
    await run(page, buffer, name, type);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
    expect((await lastRun(page))?.outcome).toBe('ok');
    await expect(page.locator('#results')).not.toContainText('could not be read');
  }
});
