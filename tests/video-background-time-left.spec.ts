import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A run of the video background tools is slower than the clip plays, so the progress line has to say how long is left
// (a bare percentage reads as stuck). 45 frames of 720x1280 take several seconds, enough to pass the short warm-up.
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));

for (const path of ['/blur-video-background', '/green-screen-video', '/tools/video-background-remover']) {
  test(`${path} shows the time left while it runs`, async ({ page }) => {
    test.setTimeout(420_000);
    await page.goto(path);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    // Before the run: the line that sets the expectation.
    await expect(page.locator('#time-note')).toContainText('slower than the video plays');
    await page.locator('#file-input').setInputFiles([clip]);
    // Record every text the progress line takes, from the page itself so none are missed between polls.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __seen: string[] }).__seen = seen;
      const el = document.getElementById('progress-text')!;
      new MutationObserver(() => seen.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true });
    });
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 240_000 });
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
    const withTime = seen.filter((t) => /about [\d ]+(s|min|h)[\d ]*(min|s)? left/.test(t));
    expect(withTime.length, `no time-left in: ${seen.slice(-5).join(' | ')}`).toBeGreaterThan(0);
    // Plausible: a clip that finishes in well under a minute never claims more than a minute (nor "0").
    const last = withTime[withTime.length - 1]!;
    const secs = Number(/about (\d+) s left/.exec(last)?.[1]);
    expect(secs).toBeGreaterThanOrEqual(10);
    expect(secs).toBeLessThanOrEqual(60);
    // It counts down: the seconds never go up as the run goes on.
    const nums = withTime.map((t) => Number(/about (\d+) s left/.exec(t)?.[1])).filter((n) => !Number.isNaN(n));
    for (let i = 1; i < nums.length; i++) expect(nums[i]!).toBeLessThanOrEqual(nums[i - 1]!);
    // And, as the brief asks, it appears before the end: the progress text said so while it was still under 100%.
    expect(withTime.some((t) => !t.includes(': 100%'))).toBe(true);
  });
}
