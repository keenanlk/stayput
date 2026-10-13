import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Chrome on Android can report a 1080p H.264 or AAC encoder as supported and then fail to create it
// ("OperationError: Encoder creation error"). Audio to video then tries a smaller frame and, last, VP9 and Opus,
// and only when every try is refused fails with its own error name, EncoderRefused.
const fx = (name: string) => fileURLToPath(new URL(`./fixtures/generated/${name}`, import.meta.url));

/** Make every VideoEncoder wider than `maxWidth` fail at creation, the way a phone's encoder does. */
async function refuseWiderThan(page: Page, maxWidth: number, only?: string) {
  await page.addInitScript(
    ([max, codecPrefix]) => {
      const Real = window.VideoEncoder;
      (window as unknown as { VideoEncoder: unknown }).VideoEncoder = class extends Real {
        private fail: (e: DOMException) => void;
        constructor(init: VideoEncoderInit) {
          super(init);
          this.fail = init.error;
        }
        override configure(config: VideoEncoderConfig) {
          if (config.width > Number(max) && (!codecPrefix || config.codec.startsWith(String(codecPrefix)))) {
            setTimeout(() => {
              this.fail(new DOMException('Encoder creation error.', 'OperationError'));
              this.close();
            });
            return;
          }
          super.configure(config);
        }
      };
    },
    [maxWidth, only ?? ''] as const,
  );
}

async function makeVideo(page: Page) {
  await page.goto('/tools/audio-to-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([fx('tone.wav'), fx('swatches.png')]);
  await page.locator('#run').click();
}

test('Audio to video falls back to a smaller frame when the 1080p encoder is refused', async ({ page }) => {
  test.setTimeout(180_000);
  await refuseWiderThan(page, 1280);
  await makeVideo(page);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  await expect(page.locator('#results-list .result-item')).toContainText('1280×720');
});

test('Audio to video steps down again, to 854×480, when 720p is refused too', async ({ page }) => {
  test.setTimeout(180_000);
  await refuseWiderThan(page, 1000, 'avc1');
  await makeVideo(page);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  await expect(page.locator('#results-list .result-item')).toContainText('854×480');
});

test('Audio to video says the encoder refused to start when every size is refused', async ({ page }) => {
  test.setTimeout(180_000);
  await refuseWiderThan(page, 320);
  await makeVideo(page);
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 150_000 });
  await expect(page.locator('#error')).toContainText('refused to start');
});
