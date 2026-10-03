import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 700 } });

test('home page demo video is self-hosted, accessible and loads nothing until played', async ({ page }) => {
  const origin = new URL(test.info().project.use.baseURL ?? 'http://localhost:4321').origin;
  const media: string[] = [];
  const posters: string[] = [];
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin) external.push(r.url());
    if (/\.(webm|mp4)$/.test(u.pathname)) media.push(u.pathname);
    if (u.pathname.startsWith('/media/')) posters.push(u.pathname);
  });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  const video = page.locator('.demo video');
  await expect(video).toHaveAttribute('preload', 'none');
  // The poster is fetched only when the video nears the viewport.
  await page.waitForLoadState('networkidle');
  expect(posters).toEqual([]);
  await video.scrollIntoViewIfNeeded();
  await expect(video).toHaveAttribute('poster', /\/media\/stayput-network-tab-poster\.webp$/);
  await expect(video).toHaveAttribute('width', '1280');
  await expect(video).toHaveAttribute('height', '720');
  await expect(video).toHaveAttribute('aria-label', /.+/);
  expect(await video.evaluate((v: HTMLVideoElement) => [v.controls, v.muted, v.autoplay, v.playsInline])).toEqual([true, true, false, true]);
  expect(await video.locator('source').evaluateAll((s) => s.map((e) => e.getAttribute('src')))).toEqual(['/media/stayput-network-tab.webm', '/media/stayput-network-tab.mp4']);
  await expect(page.locator('.demo figcaption')).toContainText('None of the requests carries a photo');

  await page.waitForLoadState('networkidle');
  expect(media).toEqual([]);

  // The strict CSP must let the video load from the site itself once played.
  const played = await video.evaluate(async (v: HTMLVideoElement) => {
    v.load();
    return await new Promise<boolean>((resolve) => {
      v.addEventListener('loadeddata', () => resolve(true), { once: true });
      v.addEventListener('error', () => resolve(false), { once: true });
    });
  });
  expect(played || media.length > 0).toBe(true);
  expect(errors.filter((e) => /Content Security Policy|media-src/i.test(e))).toEqual([]);
  expect(external.filter((u) => !u.includes('stats.keenankaufman.com'))).toEqual([]);
});

test('the service worker does not precache the demo video', async ({ request }) => {
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).not.toMatch(/\/media\/|\.webm\b|\.mp4\b/);
});
