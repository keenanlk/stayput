// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person-3s.mov', import.meta.url));
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

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
const toolRuns = (page: Page) => page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as Ev[]).filter((e) => e.n === 'tool_run').map((e) => e.d));

test.use({ userAgent: ANDROID, hasTouch: true });

/** Makes the first `times` real encodes (not the encoder probe's small frames) throw InvalidStateError with `message`. */
function breakEncoder(arg: { times: number; message: string }) {
  let left = arg.times;
  const real = VideoEncoder.prototype.encode;
  VideoEncoder.prototype.encode = function (this: VideoEncoder, frame: VideoFrame, opts?: VideoEncoderEncodeOptions) {
    if (frame.codedWidth >= 400 && left-- > 0) throw new DOMException(arg.message, 'InvalidStateError');
    return real.call(this, frame, opts);
  };
}

async function runOnce(page: Page, timeout = 200_000) {
  await page.goto('/tools/video-background-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([clip]);
  await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#run').click();
  await expect.poll(async () => (await toolRuns(page)).length, { timeout }).toBe(1);
}

test('an encoder that is invalid once is retried and the run finishes', async ({ page }) => {
  test.setTimeout(300_000);
  await stubAnalytics(page);
  await page.addInitScript(breakEncoder, { times: 1, message: 'The object is in an invalid state.' });
  await runOnce(page);
  expect(await toolRuns(page)).toMatchObject([{ outcome: 'ok' }]);
  await expect(page.locator('#results-list')).toContainText(/software video encoder|smaller size|started again/);
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
});

test('an encoder that stays invalid through every retry records CodecReclaimedError and says what to do', async ({ page }) => {
  test.setTimeout(300_000);
  await stubAnalytics(page);
  await page.addInitScript(breakEncoder, { times: 1000, message: 'The object is in an invalid state.' });
  await runOnce(page);
  const runs = await toolRuns(page);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ outcome: 'error', error_class: 'CodecReclaimedError' });
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('took back the video encoder');
  await expect(page.locator('#error')).toContainText('try once more');
});
