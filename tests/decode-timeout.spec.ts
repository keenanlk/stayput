import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A decoder that never answers must cost one budget, not two: the timeout is not retried (a refused decode is, see decode-retry.spec.ts).
const withSound = fileURLToPath(new URL('./fixtures/generated/tone.wav', import.meta.url));

test('volume booster does not retry a decode that times out', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    (window as unknown as { __decodeBudgetMs: number }).__decodeBudgetMs = 1500;
    let calls = 0;
    OfflineAudioContext.prototype.decodeAudioData = () => {
      (window as unknown as { __decodes: number }).__decodes = ++calls;
      return new Promise<AudioBuffer>(() => {});
    };
  });
  await page.goto('/tools/volume-booster');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(withSound);
  await expect(page.locator('#run')).toBeEnabled();
  const start = Date.now();
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 10_000 });
  expect(Date.now() - start).toBeLessThan(2800);
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => (window as unknown as { __decodes: number }).__decodes)).toBe(1);
});
