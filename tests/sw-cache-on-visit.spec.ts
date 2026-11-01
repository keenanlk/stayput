import { test, expect, type Request } from '@playwright/test';
import { allowServiceWorker } from './allow-sw';

// The service worker stores a page and the code it can run when the page is visited. It must not
// download the whole site on install, and a new build of sw.js must not empty what was stored.
test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ context }) => allowServiceWorker(context));

const names = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => ({
    pages: (await (await caches.open('stayput-pages')).keys()).map((r) => new URL(r.url).pathname),
    assets: (await (await caches.open('stayput-assets')).keys()).map((r) => new URL(r.url).pathname),
    all: await caches.keys(),
  }));

test('install fetches a small shell, not every page and chunk', async ({ page, context }) => {
  const sw: Request[] = [];
  context.on('request', (r) => {
    if (r.serviceWorker()) sw.push(r);
  });
  await page.goto('/tools/heic-to-jpg');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(async () => (await names(page)).pages, { timeout: 30_000 }).toContain('/tools/heic-to-jpg');
  await page.waitForTimeout(2000);
  expect(sw.length).toBeLessThan(30);
  const { pages, assets } = await names(page);
  expect(pages.filter((p) => p.startsWith('/tools/') || p.startsWith('/guides/')).length).toBe(1);
  expect(assets.length).toBeLessThan(80);
  // The tool's own on-demand code is stored, so it still runs offline.
  expect(assets.some((a) => /\/_astro\/heic-to-jpg\.astro_astro_type_script/.test(a))).toBe(true);
});

test('a preset page stores only its own tool, not every landing page tool', async ({ page }) => {
  await page.goto('/blur-video-background');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(async () => (await names(page)).pages, { timeout: 30_000 }).toContain('/blur-video-background');
  await page.waitForTimeout(3000);
  const { assets } = await names(page);
  expect(assets.some((a) => /\/_astro\/video-background\./.test(a))).toBe(true);
  expect(assets.some((a) => /\/_astro\/(compress-pdf|merge-pdf|convert-image)\./.test(a))).toBe(false);
  expect(assets.length).toBeLessThan(120);
});

test('a rebuilt sw.js keeps the stored pages and files and fetches nothing new', async ({ page, context }) => {
  await page.goto('/tools/heic-to-jpg');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(async () => (await names(page)).pages, { timeout: 30_000 }).toContain('/tools/heic-to-jpg');
  await page.waitForTimeout(2000);
  const before = await names(page);

  // Same worker with a different build id: the bytes change, so the browser installs it as an update.
  const original = await (await page.request.get('/sw.js')).text();
  await context.route('**/sw.js', (route) => route.fulfill({ contentType: 'application/javascript', body: original.replace(/stayput-[a-z0-9]+(?=")/, 'stayput-rebuilt') }));
  const requests: string[] = [];
  context.on('request', (r) => {
    if (r.serviceWorker()) requests.push(new URL(r.url()).pathname);
  });
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg!.update();
  });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL !== undefined && !(await navigator.serviceWorker.getRegistration())?.installing && !(await navigator.serviceWorker.getRegistration())?.waiting), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(2000);

  const after = await names(page);
  expect(after.all.sort()).toEqual(['stayput-assets', 'stayput-pages']);
  for (const p of before.pages) expect(after.pages).toContain(p);
  for (const a of before.assets) expect(after.assets).toContain(a);
  expect(requests.filter((p) => p.startsWith('/_astro/') || p.startsWith('/tools/'))).toEqual([]);
});

test('page caches named after a build are moved into the fixed one once', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.evaluate(async () => {
    const old = await caches.open('stayput-abc123-pages');
    await old.put('/tools/old-visited', new Response('<html>old</html>'));
  });
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    // A fresh worker runs activate again; unregistering forces the next load to install one.
    await reg!.unregister();
  });
  await page.reload();
  await expect.poll(async () => (await names(page)).all.sort().join(), { timeout: 30_000 }).toBe('stayput-assets,stayput-pages');
  expect((await names(page)).pages).toContain('/tools/old-visited');
});
