// @webkit-project
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { withRecovery, type RecoveryHooks } from '../src/lib/edit-recovery';
import { withoutSoftwareEncoder } from './no-software-encoder';

// iOS Safari answers "not supported" to a large H.264 (and VP9, AV1) encoder config while it takes a 1080p one. Blur video
// background used to end there with EncoderUnavailable after the person finder had downloaded; it now runs again at a
// smaller picture, as Compress video does. The clip is a generated fixture; the refusal (anything over 1000 px) is stubbed in the page.
const portrait = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person-3s.mov', import.meta.url));
const hooks = (): RecoveryHooks => ({ wasHidden: () => false, forgetHidden: () => {}, whenVisible: async () => {}, reclaimed: () => false });
const unavailable = (sizeRefused: boolean) => Object.assign(new Error('x'), { name: 'EncoderUnavailable', sizeRefused });

test.describe('recovery rules', () => {
  test('an encoder that refused only this size runs again one step smaller', async () => {
    const sides: (number | undefined)[] = [];
    const out = await withRecovery(
      async (a) => {
        sides.push(a.maxSide);
        if (!a.maxSide) throw unavailable(true);
        return a.retry;
      },
      () => 3840,
      hooks(),
    );
    expect(out).toBe('smaller');
    expect(sides).toEqual([undefined, 1920]);
  });

  test('a browser with no video encoder at all is not retried', async () => {
    let calls = 0;
    await expect(
      withRecovery(
        async () => {
          calls++;
          throw unavailable(false);
        },
        () => 3840,
        hooks(),
      ),
    ).rejects.toMatchObject({ name: 'EncoderUnavailable' });
    expect(calls).toBe(1);
  });
});

test('a portrait phone clip the encoder refuses at full size is blurred at a smaller size', async ({ page, browserName }) => {
  // WebKit writes through the encoder registered by encoder-probe.ts, which never asks isConfigSupported, so the stub changes nothing there.
  test.skip(browserName === 'webkit', 'the size refusal is stubbed through isConfigSupported, which the WebKit path does not use');
  test.setTimeout(300_000);
  await withoutSoftwareEncoder(page);
  await page.addInitScript(() => {
    const original = VideoEncoder.isConfigSupported.bind(VideoEncoder);
    VideoEncoder.isConfigSupported = async (config: VideoEncoderConfig) => {
      if (Math.max(config.width, config.height) > 1000) return { supported: false, config };
      return original(config);
    };
  });
  await page.goto('/blur-video-background');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([portrait]);
  await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 280_000 });
  await expect(page.locator('#results-list')).toContainText('made at a smaller size');
  await expect(page.locator('#results-list')).toContainText(/854×\d+|\d+×854/);
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
});
