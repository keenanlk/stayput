// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Phones start on the Fast person finder, a computer on Better edges, and an explicit choice wins. From Run to the first frame the
 * progress line always says something, a leave mid-run records only buckets, and Fast finding no one says to try Better edges.
 */
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person-3s.mov', import.meta.url));
const flat = fileURLToPath(new URL('./fixtures/static/flat-blue-tone.mp4', import.meta.url));
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
const PATHS = ['/tools/video-background-remover', '/blur-video-background', '/green-screen-video'];

const finderValue = (page: Page) => page.locator('input[name="finder"]:checked').getAttribute('value');
const ready = (page: Page) => expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');

/** Stub the stats tracker so tool_run events land in sessionStorage. */
async function recordEvents(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}
const runs = (page: Page) =>
  page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').map((e) => e.d));

test.describe('computer', () => {
  for (const path of PATHS) {
    test(`${path} starts on Better edges`, async ({ page }) => {
      await page.goto(path);
      await ready(page);
      expect(await finderValue(page)).toBe('edges');
      await expect(page.locator('#phone-fast-note')).toBeHidden();
    });
  }
});

test.describe('phone', () => {
  test.use({ userAgent: IPHONE, hasTouch: true, viewport: { width: 390, height: 844 } });

  for (const path of PATHS) {
    test(`${path} starts on Fast`, async ({ page }) => {
      await page.goto(path);
      await ready(page);
      expect(await finderValue(page)).toBe('fast');
      await expect(page.locator('#phone-fast-note')).toBeVisible();
      await expect(page.locator('#time-note')).toContainText('Phones start on Fast');
    });
  }

  test('an explicit choice of Better edges stands when a file is added', async ({ page }) => {
    await page.goto('/tools/video-background-remover');
    await ready(page);
    await page.locator('input[name="finder"][value="edges"]').evaluate((el) => (el as HTMLInputElement).click());
    await page.locator('#file-input').setInputFiles([clip]);
    await expect(page.locator('#run')).toBeEnabled();
    expect(await finderValue(page)).toBe('edges');
  });

  test('progress is visible at once, moves, and never goes backwards; the wake lock is held from Run to the end', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      const log: string[] = [];
      (window as unknown as { __wl: string[] }).__wl = log;
      Object.defineProperty(Navigator.prototype, 'wakeLock', {
        configurable: true,
        get: () => ({
          request: async () => {
            log.push('request');
            return { released: false, release: async () => void log.push('release'), addEventListener() {} };
          },
        }),
      });
    });
    await page.goto('/tools/video-background-remover');
    await ready(page);
    await page.locator('#file-input').setInputFiles([clip]);
    await expect(page.locator('#run')).toBeEnabled();
    await page.evaluate(() => {
      const seen: { t: number; text: string; w: number }[] = [];
      (window as unknown as { __seen: typeof seen }).__seen = seen;
      const el = document.getElementById('progress-text')!;
      const bar = document.getElementById('progress-bar')!;
      new MutationObserver(() => seen.push({ t: performance.now(), text: el.textContent ?? '', w: parseFloat(bar.style.width) || 0 })).observe(el, { childList: true, characterData: true, subtree: true });
    });
    const t0 = await page.evaluate(() => performance.now());
    await page.locator('#run').click();
    // Something is said within a second of Run.
    await expect.poll(() => page.locator('#progress-text').textContent(), { timeout: 1500 }).not.toBe('');
    // The wake lock is asked for before any frame is done, and is not given back until the run ends.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __wl: string[] }).__wl.slice())).toContain('request');
    expect(await page.evaluate(() => (window as unknown as { __wl: string[] }).__wl.includes('release'))).toBe(false);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 280_000 });
    const seen = await page.evaluate(() => (window as unknown as { __seen: { t: number; text: string; w: number }[] }).__seen);
    expect(seen.length).toBeGreaterThan(2);
    expect(seen[0]!.t - t0).toBeLessThan(1500);
    // No blank text between Run and the end of the frames.
    expect(seen.filter((s) => s.text !== '' && !s.text.startsWith('Done')).length).toBeGreaterThan(1);
    const frames = seen.filter((s) => /Frame [\d,]+ of [\d,]+/.test(s.text));
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((s) => /\d+%/.test(s.text))).toBe(true);
    // Percentages in the frame lines only go up.
    const pcts = frames.map((s) => Number(/(\d+)%/.exec(s.text)?.[1]));
    expect(pcts.every((p, i) => i === 0 || p >= pcts[i - 1]!)).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __wl: string[] }).__wl.includes('release'))).toBe(true);
  });

  test('Fast finding no one says so and suggests Better edges, and keeps the file downloadable', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/tools/video-background-remover');
    await ready(page);
    await page.locator('#file-input').setInputFiles([flat]);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#error')).toContainText('Fast person finder found no one');
    await expect(page.locator('#error')).toContainText('Better edges');
  });

  test('leaving a run records only buckets and the mode', async ({ page }) => {
    test.setTimeout(240_000);
    await recordEvents(page);
    await page.goto('/tools/video-background-remover');
    await ready(page);
    await page.locator('#file-input').setInputFiles([clip]);
    await page.locator('#run').click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('stayput:inflight'))).toContain('"phase":"run"');
    await expect(page.locator('#progress-text')).toContainText(/Checking|person finder|Frame|Replacing/);
    await page.goto('/');
    const left = (await runs(page)).filter((r) => r.error_class === 'LeftDuringRun');
    expect(left).toHaveLength(1);
    const d = left[0]!;
    expect(['<10s', '10-30s', '30-60s', '1-3m', '3-10m', '>10m']).toContain(d.left_after);
    expect(['0', '1-25', '26-50', '51-75', '76-99']).toContain(d.left_at);
    expect(d.mode).toBe('fast');
    expect(Object.keys(d).filter((k) => /ms|time|raw/i.test(k))).toEqual([]);
  });
});
