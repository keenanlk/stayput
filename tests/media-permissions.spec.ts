import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The sitewide Permissions-Policy once said camera=(), microphone=(), which blocks getUserMedia
// before any prompt. Every other media test stubs getUserMedia, so none noticed. These tests use
// Chromium's fake devices instead, against the local server that applies vercel.json's headers.

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

test('vercel.json lets the site itself use the camera and microphone, and still blocks location', () => {
  const values = vercel.headers.flatMap((h) => h.headers).filter((h) => h.key === 'Permissions-Policy').map((h) => h.value);
  expect(values.length).toBeGreaterThan(0);
  for (const v of values) {
    expect(v).toContain('camera=(self)');
    expect(v).toContain('microphone=(self)');
    expect(v).toContain('geolocation=()');
    expect(v).not.toContain('display-capture=()');
  }
  const cloudflare = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  expect(cloudflare).toContain('Permissions-Policy: camera=(self), microphone=(self), geolocation=()');
});

test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--auto-select-desktop-capture-source=Entire screen'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
  },
});

test.describe('with fake media devices and no stubs', () => {
  async function open(page: Page, path: string) {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      // MediaPipe's usage log is blocked by the CSP on purpose.
      if (m.type() === 'error' && !m.text().includes('odml.pa.googleapis.com')) errors.push(m.text());
    });
    await page.route('**/stats.keenankaufman.com/**', (r) => r.fulfill({ status: 200, body: '' }));
    const res = await page.goto(path);
    expect(res!.headers()['permissions-policy']).toMatch(/microphone=\(self\)/);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    return errors;
  }
  /** Some machines (a Mac without an audio input, a bare container) never answer an audio capture, header or no header. */
  async function audioCaptureWorks(page: Page) {
    await page.route('**/__audio-probe', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>probe</p>' }));
    await page.goto('/__audio-probe');
    return page.evaluate(async () => {
      const gum = navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => (s.getTracks().forEach((t) => t.stop()), true), () => false);
      return Promise.race([gum, new Promise<boolean>((r) => setTimeout(() => r(false), 5000))]);
    });
  }
  const noPolicyViolation = (errors: string[]) => expect(errors.filter((e) => /permissions? policy/i.test(e))).toEqual([]);

  test('mic-test reaches a verdict', async ({ page }) => {
    test.skip(!(await audioCaptureWorks(page)), 'this machine cannot capture fake audio even without the header');
    const errors = await open(page, '/tools/mic-test');
    await page.locator('#mic-start').click();
    await expect(page.locator('#mic-panel')).toHaveAttribute('data-verdict', /ok|quiet|loud|silent/, { timeout: 15_000 });
    await expect(page.locator('#mic-live')).toBeVisible();
    noPolicyViolation(errors);
    expect(errors).toEqual([]);
  });

  test('webcam-test shows video', async ({ page }) => {
    const errors = await open(page, '/tools/webcam-test');
    await page.locator('#cam-start').click();
    await expect(page.locator('#cam-panel')).toHaveAttribute('data-state', 'live', { timeout: 15_000 });
    await expect.poll(() => page.locator('#cam-video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    noPolicyViolation(errors);
    expect(errors).toEqual([]);
  });

  test('voice-recorder starts recording', async ({ page }) => {
    test.skip(!(await audioCaptureWorks(page)), 'this machine cannot capture fake audio even without the header');
    const errors = await open(page, '/tools/voice-recorder');
    await page.locator('#vr-start').click();
    await expect(page.locator('#vr-stop')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#vr-note')).not.toHaveClass(/is-warn/);
    noPolicyViolation(errors);
    expect(errors).toEqual([]);
  });

  test('tuner hears the microphone', async ({ page }) => {
    test.skip(!(await audioCaptureWorks(page)), 'this machine cannot capture fake audio even without the header');
    const errors = await open(page, '/tools/tuner');
    await page.locator('#tuner-start').click();
    await expect(page.locator('#tuner-live')).toBeVisible({ timeout: 15_000 });
    noPolicyViolation(errors);
    expect(errors).toEqual([]);
  });

  test('screen-recorder records the screen with the microphone on', async ({ page }) => {
    test.skip(!(await audioCaptureWorks(page)), 'this machine cannot capture fake audio even without the header');
    const errors = await open(page, '/tools/screen-recorder');
    await page.locator('#rec-mic').check();
    await page.locator('#rec-start').click();
    await expect(page.locator('#rec-stop')).toBeVisible({ timeout: 15_000 });
    // A blocked microphone would only show as a warning that the recording has no voice.
    await expect(page.locator('#rec-note')).not.toContainText('microphone was not allowed');
    noPolicyViolation(errors);
    expect(errors).toEqual([]);
  });
});
