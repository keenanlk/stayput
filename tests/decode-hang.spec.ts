// @webkit-project
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Safari on Linux gives decodeAudioData a cut-short MP4 and then never answers. The page must refuse such a file by
// itself (its sound cannot be found in the container), not wait on the browser's decoder: here the decoder is made to
// hang for good, as it does there, and the run must still end in a named refusal.
const cutShort = fileURLToPath(new URL('./fixtures/edge-cases/truncated-moov-end.mp4', import.meta.url));

for (const path of ['/increase-video-volume', '/remove-background-noise-from-video', '/tools/volume-booster', '/tools/remove-noise']) {
  test(`${path} refuses a cut-short video when the browser's decoder never answers`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
      (window as unknown as { __events: unknown[] }).__events = [];
      OfflineAudioContext.prototype.decodeAudioData = () => new Promise<AudioBuffer>(() => {});
    });
    await page.route('https://stats.keenankaufman.com/**', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: 'window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
    );
    await page.goto(path);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(cutShort);
    await expect(page.locator('#run')).toBeEnabled();
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 15_000 });
    const run = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events.filter((e) => e.n === 'tool_run').at(-1)?.d);
    expect(run?.outcome).toBe('error');
    expect(run?.error_class).toBe('AudioDecodeError');
  });
}
