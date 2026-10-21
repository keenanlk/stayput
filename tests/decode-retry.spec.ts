import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A phone short of memory can refuse a sound it reads fine a moment later: the first decode is made to fail and the
// run must still finish. A file that fails every time keeps its class (decode-hang.spec.ts and edge-cases.spec.ts).
const withSound = fileURLToPath(new URL('./fixtures/generated/tone.wav', import.meta.url));

test('volume booster reads a sound again when the first decode is refused', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    const real = OfflineAudioContext.prototype.decodeAudioData;
    let calls = 0;
    OfflineAudioContext.prototype.decodeAudioData = function (this: OfflineAudioContext, data: ArrayBuffer) {
      (window as unknown as { __decodes: number }).__decodes = ++calls;
      if (calls === 1) return Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
      return real.call(this, data);
    } as typeof real;
  });
  await page.goto('/tools/volume-booster');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(withSound);
  await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#run').click();
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect(page.locator('#results-list .result-item')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __decodes: number }).__decodes)).toBe(2);
});
