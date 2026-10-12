import { test, expect, type Browser } from '@playwright/test';
import { blankVideo, events, gumCalls, launch, liveTracks, prepare } from './qr-camera-helpers';

// The scanner's camera route with nothing to read, and when the camera cannot start.

test.use({ permissions: ['camera'], launchOptions: launch(blankVideo) });

test.describe('with nothing in front of the camera', () => {
  test('the camera goes live, says what to do, and Stop turns it off', async ({ page }) => {
    await prepare(page);
    await page.locator('#qs-start').click();
    await expect(page.locator('#qs-camera')).toHaveAttribute('data-state', 'live');
    await expect(page.locator('#qs-note')).toContainText('Hold the code inside the picture.');
    await expect(page.locator('#qs-stop')).toBeVisible();
    expect(await liveTracks(page)).toBeGreaterThan(0);
    await page.waitForTimeout(1200);
    await expect(page.locator('#qs-results .qs-card')).toHaveCount(0);
    await page.locator('#qs-stop').click();
    expect(await liveTracks(page)).toBe(0);
    await expect(page.locator('#qs-camera')).toHaveAttribute('data-state', 'idle');
    // No outcome, so no tool_run: stopping is not a failure.
    expect((await events(page)).filter((e) => e.n === 'tool_run')).toEqual([]);
  });

  test('hiding the tab turns the camera off and says so', async ({ page }) => {
    await prepare(page);
    await page.locator('#qs-start').click();
    await expect(page.locator('#qs-camera')).toHaveAttribute('data-state', 'live');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#qs-note')).toContainText('The camera was turned off because you left this tab. Press Scan with camera to use it again.');
    expect(await liveTracks(page)).toBe(0);
    await expect(page.locator('#qs-start')).toBeVisible();
    expect((await events(page)).filter((e) => e.n === 'tool_run')).toEqual([]);
  });

  test('leaving the page releases the camera', async ({ page }) => {
    await prepare(page);
    await page.locator('#qs-start').click();
    await expect(page.locator('#qs-camera')).toHaveAttribute('data-state', 'live');
    expect(await liveTracks(page)).toBeGreaterThan(0);
    // Registered after the page's own pagehide handler, so it sees the state after release.
    await page.evaluate(() => {
      window.addEventListener('pagehide', () => {
        const live = (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length;
        sessionStorage.setItem('live-after-pagehide', String(live));
      });
    });
    await page.goto('/');
    expect(await page.evaluate(() => sessionStorage.getItem('live-after-pagehide'))).toBe('0');
  });

  test('the camera is not asked for when the page has no secure context', async ({ page }) => {
    await prepare(page, () => Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }));
    await page.locator('#qs-start').click();
    await expect(page.locator('#qs-note')).toContainText('The camera works only on secure pages (https)');
    expect(await gumCalls(page)).toBe(0);
  });
});

test.describe('when the camera cannot start', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

  async function fail(browser: Browser, baseURL: string | undefined, name: string, userAgent?: string) {
    const context = await browser.newContext({ baseURL, ...(userAgent ? { userAgent } : {}) });
    const page = await context.newPage();
    await prepare(
      page,
      (n: string) => {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('stub', n));
      },
      name,
    );
    return { page, context };
  }

  const cases: [string, string | undefined, RegExp, string][] = [
    ['NotAllowedError', undefined, /Click the camera or lock icon at the left of the address bar/, 'desktop'],
    ['NotAllowedError', IPHONE, /1\. Tap the aA button at the left of the address bar\./, 'iPhone'],
    ['NotAllowedError', ANDROID, /2\. Tap Permissions, then Camera, and choose Allow\./, 'Android'],
    ['NotFoundError', undefined, /No camera was found on this device\./, 'no camera'],
    ['NotReadableError', undefined, /The camera is in use by another app or tab/, 'in use'],
    ['SecurityError', undefined, /This page is not allowed to use the camera here\./, 'policy'],
    ['SomethingElse', undefined, /The camera could not start\. Choose or paste an image above instead\./, 'other'],
  ];
  for (const [name, ua, copy, label] of cases) {
    test(`${name} (${label}) shows its own wording and is counted by class only`, async ({ browser, baseURL }) => {
      const { page, context } = await fail(browser, baseURL, name, ua);
      await page.locator('#qs-start').click();
      await expect(page.locator('#qs-note')).toContainText(copy);
      await expect(page.locator('#qs-note')).toHaveClass(/is-warn/);
      await expect(page.locator('#qs-start')).toBeVisible();
      const runs = (await events(page)).filter((e) => e.n === 'tool_run');
      expect(runs).toHaveLength(1);
      expect(runs[0]!.d).toMatchObject({ outcome: 'error', format: 'camera', error_class: name });
      expect((await events(page)).filter((e) => e.n === 'files_added')).toHaveLength(1);
      // Never the browser's own message.
      await expect(page.locator('#qs-note')).not.toContainText('stub');
      await context.close();
    });
  }

  test('no camera API at all says to open the page in Safari or Chrome', async ({ page }) => {
    await prepare(page, () => {
      Object.defineProperty(Navigator.prototype, 'mediaDevices', { get: () => undefined, configurable: true });
    });
    await page.locator('#qs-start').click();
    await expect(page.locator('#qs-note')).toContainText('This browser cannot use a camera in web pages.');
    await expect(page.locator('#qs-note')).toContainText('open it in Safari or Chrome instead');
  });
});
