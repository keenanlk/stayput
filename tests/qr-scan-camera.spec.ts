import { test, expect } from '@playwright/test';
import { events, gumCalls, launch, liveTracks, prepare, qrVideo, url } from './qr-camera-helpers';
import { siteHost } from './allowed-host';

// The scanner's camera route with a QR code in front of the camera.

test.use({ permissions: ['camera'], launchOptions: launch(qrVideo) });

test.describe('with a QR code in front of the camera', () => {

  test('the camera starts only on the button, reads the code, shows it and turns off', async ({ page, context }) => {
    const { seen, errors } = await prepare(page);
    const popups: string[] = [];
    context.on('page', (p) => popups.push(p.url()));
    expect(await gumCalls(page)).toBe(0);
    await page.waitForTimeout(500);
    expect(await gumCalls(page)).toBe(0);
    await expect(page.locator('#qs-camera')).toHaveAttribute('data-state', 'idle');
    const before = page.url();
    await page.locator('#qs-start').click();
    await expect(page.locator('#qs-results .qs-card')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('#qs-results .qs-kind')).toHaveText('Link');
    await expect(page.locator('#qs-results .qs-address')).toHaveText(url);
    expect(await gumCalls(page)).toBe(1);
    expect(await liveTracks(page)).toBe(0);
    await expect(page.locator('#qs-camera')).toHaveAttribute('data-state', 'done');
    await expect(page.locator('#qs-start')).toHaveText('Scan again');
    expect(page.url()).toBe(before);
    expect(popups).toEqual([]);
    // The page is still here and the camera is off: scanning again works.
    await page.locator('#qs-start').click();
    await expect(page.locator('#qs-results .qs-card')).toHaveCount(1, { timeout: 15_000 });
    expect(await liveTracks(page)).toBe(0);
    expect(errors).toEqual([]);
    expect(seen.some((r) => r.url.endsWith('/vendor/zxing-wasm@3.1.6/zxing_reader.wasm'))).toBe(true);
    expect(seen.filter((r) => /jsdelivr|unpkg|cdnjs/.test(r.url))).toEqual([]);
    for (const r of seen) {
      if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue;
      const host = new URL(r.url).hostname;
      if (host === 'stats.keenankaufman.com') {
        expect(r.body ?? '').not.toContain('stayput.dev/tools');
        continue;
      }
      expect(host, r.url).toBe(siteHost());
      expect(r.method, r.url).toBe('GET');
      expect(r.body, r.url).toBeNull();
    }
  });

  test('analytics: one files_added per attempt and one tool_run with format camera, and nothing read', async ({ page }) => {
    await prepare(page);
    await page.locator('#qs-start').click();
    await expect(page.locator('#qs-results .qs-card')).toHaveCount(1, { timeout: 15_000 });
    await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
    const all = (await events(page)).filter((e) => e.n === 'files_added' || e.n === 'tool_run');
    expect(all.map((e) => e.n)).toEqual(['files_added', 'tool_run']);
    expect(all[0]!.d).toMatchObject({ tool: 'qr-code-scanner', files: '1' });
    expect(all[1]!.d).toMatchObject({ tool: 'qr-code-scanner', outcome: 'ok', format: 'camera', attempt: 'first-ok', files: '1' });
    expect(JSON.stringify(all)).not.toContain('stayput.dev/tools');
    expect(all[1]!.d).not.toHaveProperty('error_class');
  });
});

