// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { isBlankFrame } from '../src/lib/decode-probe';

// A clip the browser says it can decode but cannot (iOS Safari with HEVC: "EncodingError: Decoder failure") is refused as DecodeFailed
// before any model downloads, and a decoder failure part-way through a run is not retried at a smaller size as if the encoder had failed.
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
});

/** In the page: the decoder reports "Decoder failure" for frames after `afterFrames` decodes, or for timestamps over `afterSeconds`. */
async function breakDecoder(page: Page, when: { afterFrames?: number; afterSeconds?: number; onlyWhileRunning?: boolean }) {
  await page.addInitScript((when) => {
    let n = 0;
    const original = VideoDecoder.prototype.decode;
    VideoDecoder.prototype.decode = function (this: VideoDecoder, chunk: EncodedVideoChunk) {
      // Not the up-front probe: only once the page says the frames themselves are being replaced.
      if (when.onlyWhileRunning && !/Replacing the background/.test(document.getElementById('progress-text')?.textContent ?? '')) return original.call(this, chunk);
      n++;
      const late = when.afterSeconds !== undefined && chunk.timestamp / 1e6 > when.afterSeconds;
      const nth = when.afterFrames !== undefined && n > when.afterFrames;
      if (late || nth) {
        (window as unknown as { __decodeFails: number }).__decodeFails = ((window as unknown as { __decodeFails?: number }).__decodeFails ?? 0) + 1;
        // The failure arrives on the decoder's error callback, as WebKit's does.
        queueMicrotask(() => this.dispatchEvent?.(new Event('error')));
        throw new DOMException('Decoder failure', 'EncodingError');
      }
      return original.call(this, chunk);
    };
  }, when);
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([clip]);
}

test('a clip whose decoder fails early: DecodeFailed before any model request', async ({ page }) => {
  const models: string[] = [];
  page.on('request', (r) => /\/models\/|onnx|\.tflite|mediapipe/i.test(r.url()) && models.push(r.url()));
  await breakDecoder(page, { afterFrames: 2 });
  await open(page, '/blur-video-background');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 10_000 });
  await expect(page.locator('#error')).toContainText("can't decode this video's picture");
  expect(models).toEqual([]);
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'error', error_class: 'DecodeFailed' });
});

test('face blur: the same clip is refused first, as DecodeFailed', async ({ page }) => {
  await breakDecoder(page, { afterFrames: 2 });
  await open(page, '/tools/blur-face-video');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 10_000 });
  await expect.poll(async () => (await events(page)).find((e) => e.n === 'tool_run')?.d.error_class).toBe('DecodeFailed');
});

test('a decoder that fails part-way through: DecodeFailed, and the job ran once', async ({ page }) => {
  test.setTimeout(240_000);
  await breakDecoder(page, { afterSeconds: 1.0, onlyWhileRunning: true });
  // Every line the progress text showed, to catch a "Trying again" that came and went.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('progress-text');
      if (el) new MutationObserver(() => seen.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true });
    });
  });
  await open(page, '/blur-video-background');
  await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen.some((t) => /Replacing the background/.test(t))).toBe(true);
  expect(seen.join('\n')).not.toMatch(/Trying again|Trying once more|smaller size/);
  await expect.poll(async () => (await events(page)).find((e) => e.n === 'tool_run')?.d.error_class).toBe('DecodeFailed');
});

test.describe('the blank-frame check', () => {
  test('a fully transparent picture is not decodable; a pattern is', () => {
    expect(isBlankFrame(new Uint8ClampedArray(16 * 16 * 4))).toBe(true);
    const pattern = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < pattern.length; i += 4) pattern.set([i % 255, 80, 160, 255], i);
    expect(isBlankFrame(pattern)).toBe(false);
    // One opaque pixel is enough to be a picture.
    const one = new Uint8ClampedArray(16 * 16 * 4);
    one[3] = 255;
    expect(isBlankFrame(one)).toBe(false);
  });
});
