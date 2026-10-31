// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { withoutSoftwareEncoder } from './no-software-encoder';

// Compress video on a phone whose video encoder gives up (iOS Safari: EncodingError) runs again at a smaller picture before
// it fails, and when every size fails it keeps the class name and says what to try. The encoder is made to refuse in the page.
const phoneMov = fileURLToPath(new URL('./fixtures/static/iphone-portrait.mov', import.meta.url));

/** Once the page says it is compressing, the encoder throws `name`: once, or on every frame when `always`. */
async function breakEncoder(page: Page, name: string, always: boolean) {
  await withoutSoftwareEncoder(page);
  await page.addInitScript(() => ((window as unknown as { __stayputNoSizeProbe: boolean }).__stayputNoSizeProbe = true));
  await page.addInitScript(
    ([name, always]) => {
      let armed = false;
      const original = VideoEncoder.prototype.encode;
      VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
        // Not the encoder probe's test frames: only once the page says the clip itself is being compressed.
        const running = /Compressing/.test(document.getElementById('progress-text')?.textContent ?? '');
        if (running && (always || !armed)) {
          armed = true;
          throw new DOMException('forced by the test', name as string);
        }
        return original.apply(this, args);
      };
    },
    [name, always] as const,
  );
}

async function run(page: Page) {
  await page.goto('/tools/compress-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([phoneMov]);
  await page.locator('#run').click();
}

test('the encoder gives up at full size: the clip is compressed at a smaller size and says so', async ({ page, browserName }) => {
  test.setTimeout(240_000);
  await breakEncoder(page, 'EncodingError', false);
  await run(page);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  await expect(page.locator('#results-list')).toContainText(browserName === 'webkit' ? 'made on a second try' : 'made at a smaller size');
  if (browserName !== 'webkit') await expect(page.locator('#results-list')).toContainText(/854×\d+|\d+×854/);
});

test('the encoder refuses at every size: the run fails as EncodingError with plain words', async ({ page }) => {
  test.setTimeout(240_000);
  await breakEncoder(page, 'EncodingError', true);
  await run(page);
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
  await expect(page.locator('#error')).toContainText(/even after trying again/);
  await expect(page.locator('#error')).toContainText(/Try a shorter clip/);
});
