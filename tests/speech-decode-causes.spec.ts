import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Why a recording's sound fails to decode on the speech pages, each cause with its own outcome:
 *  - the browser refuses a long stretch (too big for the device, or one damaged bit in it): the stretch is cut in
 *    halves, the good parts are read and only the damaged bit is left out, and the result says so;
 *  - most of the sound is refused: AudioDamaged, not the catch-all;
 *  - a file that is no recording at all: NotAnAudioFile.
 * The browser's decoder is a stand-in that refuses by rule, so the same spec runs without an AAC decoder (CI's Linux
 * Chromium has none); the recording is a real 16-second AAC clip.
 */
const SPEECH_MOV = readFileSync(fileURLToPath(new URL('./fixtures/static/speech.mov', import.meta.url)));
const POISON = Buffer.from('DAMAGED!DAMAGED!');

/** The clip with its middle tenth overwritten every kilobyte (sound and picture are interleaved, so this lands on both). */
function damagedAt(fraction: number): Buffer {
  const b = Buffer.from(SPEECH_MOV);
  const mdat = b.indexOf('mdat');
  const from = Math.floor(mdat + (b.length - mdat) * fraction);
  for (let at = from; at < from + (b.length - mdat) / 10; at += 1024) POISON.copy(b, at);
  return b;
}

type Rule = 'bytes-over-half' | 'poison' | 'always';

async function stub(page: Page, rule: Rule) {
  await page.addInitScript(
    ([rule, poison]) => {
      const w = window as unknown as { __wrapped: number[]; __maxOk: number };
      w.__wrapped = [];
      w.__maxOk = 0;
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
      const has = (bytes: Uint8Array, text: string) => {
        const t = new TextEncoder().encode(text);
        outer: for (let i = 0; i + t.length <= bytes.length; i++) {
          for (let j = 0; j < t.length; j++) if (bytes[i + j] !== t[j]) continue outer;
          return true;
        }
        return false;
      };
      // The browser's decoder: a tone for every wrapped stretch it accepts, an EncodingError for the ones it refuses.
      OfflineAudioContext.prototype.decodeAudioData = function (this: OfflineAudioContext, data: ArrayBuffer) {
        const bytes = new Uint8Array(data);
        w.__wrapped.push(bytes.length);
        const biggest = Math.max(...w.__wrapped);
        const refuse = rule === 'always' || (rule === 'poison' && has(bytes, poison)) || (rule === 'bytes-over-half' && bytes.length > biggest * 0.6 && w.__wrapped.length <= 2);
        if (refuse) return Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
        w.__maxOk = Math.max(w.__maxOk, bytes.length);
        const seconds = Math.max(0.2, bytes.length / 20000);
        const buffer = new AudioBuffer({ length: Math.round(seconds * this.sampleRate), sampleRate: this.sampleRate, numberOfChannels: 1 });
        const ch = buffer.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = 0.2 * Math.sin((2 * Math.PI * 300 * i) / this.sampleRate);
        return Promise.resolve(buffer);
      } as typeof OfflineAudioContext.prototype.decodeAudioData;
      const Real = window.Worker;
      class FakeWorker extends EventTarget {
        postMessage(msg: { id: number }) {
          setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'result', chunks: [{ start: 0, end: 1, text: 'Hello from the park' }], language: 'en' } })), 5);
        }
        terminate() {}
      }
      (window as unknown as { Worker: unknown }).Worker = function (url: string | URL, opts?: WorkerOptions) {
        return /transcribe/.test(String(url)) ? new FakeWorker() : new Real(url, opts);
      };
    },
    [rule, POISON.toString('latin1')] as const,
  );
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}

const lastRun = (page: Page) =>
  page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)?.d);

async function run(page: Page, buffer: Buffer, name = 'clip.mov', mimeType = 'video/quicktime') {
  await page.goto('/tools/transcribe');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name, mimeType, buffer });
  await page.locator('#run').click();
}

test('a stretch the browser refuses as too big is cut in halves and read, with nothing left out', async ({ page }) => {
  await stub(page, 'bytes-over-half');
  await run(page, SPEECH_MOV);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect((await lastRun(page))?.outcome).toBe('ok');
  await expect(page.locator('#results')).not.toContainText('could not be read');
  const seen = await page.evaluate(() => (window as unknown as { __wrapped: number[] }).__wrapped);
  // The whole stretch was refused (and tried once more), then each half was decoded.
  expect(seen.length).toBeGreaterThanOrEqual(4);
});

test('one damaged bit in a recording is left out, the rest is read, and the result says so', async ({ page }) => {
  await stub(page, 'poison');
  await run(page, damagedAt(0.45));
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect((await lastRun(page))?.outcome).toBe('ok');
  await expect(page.locator('#results')).toContainText(/of the sound could not be read and was left out/);
});

test('a recording whose sound the browser refuses throughout fails as AudioDamaged, not the catch-all', async ({ page }) => {
  await stub(page, 'always');
  await run(page, SPEECH_MOV);
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText('damaged or cut short');
  expect((await lastRun(page))?.error_class).toBe('AudioDamaged');
});

test('a picture chosen as a recording fails as NotAnAudioFile', async ({ page }) => {
  await stub(page, 'always');
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  await run(page, gif, 'talk.mp3', 'audio/mpeg');
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText("doesn't look like a recording");
  expect((await lastRun(page))?.error_class).toBe('NotAnAudioFile');
});
