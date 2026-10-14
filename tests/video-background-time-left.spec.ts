// @webkit-project
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// (a bare percentage reads as stuck). The figure waits for 8% and 10 s of work; tests/time-left.spec.ts has the exact rules.
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
    const started = Date.now();
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 240_000 });
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
    const withTime = seen.filter((t) => /about [\d ]+(s|min|h)[\d ]*(min|s)? left/.test(t));
    // The figure waits for 8% and 10 s of real work, so a short clip can finish before any figure is worth showing:
    // it then says it is estimating, and never a figure.
    if (withTime.length === 0 && Date.now() - started < 14_000) {
      expect(seen.some((t) => t.includes('Estimating time left…'))).toBe(true);
      return;
    }
    expect(withTime.length, `no time-left in: ${seen.slice(-5).join(' | ')}`).toBeGreaterThan(0);
    // Plausible: a clip that finishes in well under a minute never claims more than a minute (nor "0").
    const last = withTime[withTime.length - 1]!;
    const secs = Number(/about (\d+) s left/.exec(last)?.[1]);
    expect(secs).toBeGreaterThanOrEqual(10);
    expect(secs).toBeLessThanOrEqual(60);
    // It counts down. A run that really does slow part way (a busy CI chip) may raise the figure once, so one rise is
    // allowed; a figure that jitters up and down, or counts up, rises again and again. (tests/time-left.spec.ts holds
    // the strict count-down rules with a fake clock.)
    const nums = withTime.map((t) => Number(/about (\d+) s left/.exec(t)?.[1])).filter((n) => !Number.isNaN(n));
    const rises = nums.filter((n, i) => i > 0 && n > nums[i - 1]!).length;
    expect(rises, `the time left went up ${rises} times: ${nums.join(' ')}`).toBeLessThanOrEqual(1);
    // And, as the brief asks, it appears before the end: the progress text said so while it was still under 100%.
    expect(withTime.some((t) => !t.includes(': 100%'))).toBe(true);
  });
}
