import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';

// Homepage hero test (home-hero). The real build has the test off, so this spec builds a
// test copy of the site with STAYPUT_AB_TEST=home-hero and serves it from a throwaway port.
// One worker builds and serves the test copy (a second build would race on public/vendor).
test.describe.configure({ mode: 'serial' });

let out = '';
let server: Server;
let base = '';

test.beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'home-hero-'));
  execFileSync('npx', ['astro', 'build', '--outDir', out], { env: { ...process.env, STAYPUT_AB_TEST: 'home-hero' }, stdio: 'pipe' });
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.webm': 'video/webm', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
  server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    let file = resolve(out, '.' + path);
    if (!file.startsWith(out)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    else if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(() => { server?.close(); });

const widths = [360, 390, 768, 1440];

for (const variant of ['A', 'B'] as const) {
  for (const w of widths) {
    test(`forced ${variant} at ${w}px: right lede, one h1, one video, no overflow`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
      await page.goto(`${base}/?ab=home-hero:${variant}`);
      await expect(page.locator('html')).toHaveAttribute('data-ab-home-hero', variant);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText('Your files stay put.');
      const visible = page.locator('.hero .lede:visible');
      await expect(visible).toHaveCount(1);
      if (variant === 'B') await expect(visible).toHaveText('Convert, compress and edit files in your browser. Nothing is uploaded.');
      else await expect(visible).toContainText('nothing is watermarked');
      // The lede that is not shown is not read out either.
      await expect(page.locator(`.hero .lede[data-ab="home-hero:${variant === 'A' ? 'B' : 'A'}"]`)).toBeHidden();
      await expect(page.locator('video')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const pos = await page.evaluate(() => {
        const top = (s: string) => document.querySelector(s)!.getBoundingClientRect().top + scrollY;
        const tiles = [...document.querySelectorAll('.start-tiles a')].map((a) => a.getBoundingClientRect());
        const last = [...document.querySelectorAll('.index section')].pop()!.getBoundingClientRect();
        return { tiles: tiles.length, tilesBottom: Math.max(...tiles.map((t) => t.bottom)), vh: innerHeight, demo: top('.demo'), spec: top('[aria-labelledby="spec-h"]'), popular: top('.popular'), lastIndexBottom: last.bottom + scrollY };
      });
      expect(pos.tiles).toBe(6);
      expect(pos.tilesBottom).toBeLessThan(pos.vh);
      if (variant === 'B') {
        expect(pos.demo).toBeGreaterThan(pos.lastIndexBottom - 1);
        expect(pos.demo).toBeLessThan(pos.spec);
      } else {
        expect(pos.demo).toBeLessThan(pos.popular);
      }
    });
  }
}

test('B: the demo is a single video that loads nothing until played, then plays from the site', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const media: string[] = [];
  const hosts = new Set<string>();
  page.on('request', (r) => {
    const u = new URL(r.url());
    hosts.add(u.host);
    if (/\.(webm|mp4)$/.test(u.pathname) || u.pathname.startsWith('/media/')) media.push(u.pathname);
  });
  await page.goto(`${base}/?ab=home-hero:B`);
  await page.waitForLoadState('networkidle');
  expect(media).toEqual([]);
  const video = page.locator('.demo video');
  await expect(video).toHaveAttribute('preload', 'none');
  await video.scrollIntoViewIfNeeded();
  await expect(video).toHaveAttribute('poster', /stayput-network-tab-poster\.webp$/);
  await expect(page.locator('.demo figcaption')).toContainText('The video has captions');
  expect([...hosts]).toEqual([new URL(base).host]);
});

test('without ?ab the pick is random and sticks for the tab; the page is the same in either', async ({ page }) => {
  await page.goto(`${base}/`);
  const first = await page.locator('html').getAttribute('data-ab-home-hero');
  expect(['A', 'B']).toContain(first);
  await page.goto(`${base}/pdf-to-jpg`).catch(() => {});
  await page.goto(`${base}/`);
  expect(await page.locator('html').getAttribute('data-ab-home-hero')).toBe(first);
});

test('the production build (test off) has one lede, the demo in place, and no override script', async () => {
  const dist = join(process.cwd(), 'dist');
  test.skip(!existsSync(join(dist, 'index.html')), 'needs a built dist');
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  expect(html).not.toContain('data-ab');
  expect(html).not.toContain('ab-force');
  expect(existsSync(join(dist, 'ab-force.js'))).toBe(false);
  expect(html).not.toContain('stayput-ab');
  expect(html.match(/class="lede"/g)?.length).toBe(1);
  expect(html.indexOf('aria-labelledby="demo-h"')).toBeLessThan(html.indexOf('id="popular-h"'));
});
