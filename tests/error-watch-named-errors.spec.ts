import { test, expect, devices, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Error watch: side-by-side video on Android started with one video and recorded InputError; mute-video, flip-video and
// increase-video-volume recorded a bare TypeError. Run now waits for both videos, and each step names what it throws.
const fx = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));
const A = fx('sbs-a-24fps.mp4');
const B = fx('sbs-b-30fps-6s.mp4');
const CLIP = fx('clip-720p-10s.mp4');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

type Ev = { n: string; d: Record<string, string> };
async function stubAnalytics(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}
const toolRuns = (page: Page) => page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as Ev[]).filter((e) => e.n === 'tool_run').map((e) => e.d));

test.describe('side by side video, Android Chrome', () => {
  const { defaultBrowserType: _ignored, ...pixel } = devices['Pixel 7'];
  test.use({ ...pixel, userAgent: ANDROID });

  test('one picked video leaves Run off, with a reason, and is not a run at all', async ({ page }) => {
    await stubAnalytics(page);
    await page.goto('/tools/side-by-side-video');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    // The Android picker hands over one file at a time.
    await page.locator('#sbs-file-a').setInputFiles(A);
    await expect(page.locator('#sbs-name-a')).toContainText('sbs-a-24fps');
    await expect(page.locator('#run')).toBeDisabled();
    await expect(page.locator('#sbs-info')).toContainText('second video');
    expect(await toolRuns(page)).toHaveLength(0);
    // The second one arrives through its own slot: the pair is runnable.
    await page.locator('#sbs-file-b').setInputFiles(B);
    await expect(page.locator('#sbs-info')).toContainText('Result:');
    await expect(page.locator('#run')).toBeEnabled();
  });

  test('the same on slot B first', async ({ page }) => {
    await stubAnalytics(page);
    await page.goto('/tools/side-by-side-video');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#sbs-file-b').setInputFiles(B);
    await expect(page.locator('#run')).toBeDisabled();
    await page.locator('#sbs-file-a').setInputFiles(A);
    await expect(page.locator('#run')).toBeEnabled();
  });
});

// A bare TypeError out of the file reads, forced once Run is pressed.
async function breakReadsOnRun(page: Page) {
  await page.addInitScript(() => {
    let armed = false;
    document.addEventListener(
      'click',
      (e) => {
        if ((e.target as HTMLElement | null)?.closest?.('#run')) armed = true;
      },
      true,
    );
    for (const name of ['slice', 'stream', 'arrayBuffer'] as const) {
      const real = Blob.prototype[name] as (...a: unknown[]) => unknown;
      Blob.prototype[name] = function (this: Blob, ...a: unknown[]) {
        if (armed) throw new TypeError("Cannot read properties of undefined (reading 'x')");
        return real.apply(this, a);
      } as never;
    }
  });
}

for (const [path, file] of [
  ['/tools/mute-video', CLIP],
  ['/flip-video', CLIP],
  ['/increase-video-volume', CLIP],
] as const) {
  test(`${path}: a bare TypeError during the run is recorded under a step name`, async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnalytics(page);
    await breakReadsOnRun(page);
    await page.goto(path);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(file);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 90_000 });
    const runs = await toolRuns(page);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ outcome: 'error' });
    expect(runs[0]!.error_class).not.toMatch(/^(TypeError|Error)$|UnnamedError$/);
  });
}
