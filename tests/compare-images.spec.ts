// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { aspectDiffers, diffPixels, diffSize, formatPercent } from '../src/lib/image-diff';

/**
 * Compare images: two canvas-made images are dropped into the page; the percentage of differing
 * pixels, scaling, the 4,096 px cap, the three views and the difference-map download are checked.
 * Chromium and WebKit; images are built in the page because Safari can't encode WebP.
 */

type Spec = { w: number; h: number; block?: { x: number; y: number; size: number }; flat?: [number, number, number] };

/** A deterministic gradient PNG (never pure black), optionally with a black square. */
async function makePng(page: Page, s: Spec): Promise<Buffer> {
  const bytes = await page.evaluate(async (s) => {
    const c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const ctx = c.getContext('2d')!;
    if (s.flat) {
      ctx.fillStyle = `rgb(${s.flat.join(',')})`;
      ctx.fillRect(0, 0, s.w, s.h);
    } else {
      const g = ctx.createLinearGradient(0, 0, s.w, s.h);
      g.addColorStop(0, 'rgb(60,90,200)');
      g.addColorStop(1, 'rgb(220,180,70)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s.w, s.h);
    }
    if (s.block) {
      ctx.fillStyle = '#000';
      ctx.fillRect(s.block.x, s.block.y, s.block.size, s.block.size);
    }
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, s);
  return Buffer.from(bytes);
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/tools/compare-images');
  await expect(page.locator('#tool[data-ready="true"]')).toBeVisible();
  return errors;
}

async function load(page: Page, a: Buffer, b: Buffer) {
  if (await page.locator('#clear').isVisible()) await page.locator('#clear').click();
  await page.setInputFiles('#file-input', [
    { name: 'a.png', mimeType: 'image/png', buffer: a },
    { name: 'b.png', mimeType: 'image/png', buffer: b },
  ]);
  await expect(page.locator('#cmp-result')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#cmp-readout')).toContainText('of pixels differ', { timeout: 60_000 });
}

const percent = async (page: Page) => Number(await page.locator('#cmp-readout').getAttribute('data-percent'));

test('the diff helpers count changed pixels and cap the size', () => {
  const a = new Uint8ClampedArray([10, 10, 10, 255, 100, 100, 100, 255]);
  const b = new Uint8ClampedArray([10, 10, 10, 255, 130, 100, 100, 255]);
  expect(diffPixels(a, a, 0).changed).toBe(0);
  expect(diffPixels(a, b, 0).changed).toBe(1);
  expect(diffPixels(a, b, 29).changed).toBe(1);
  expect(diffPixels(a, b, 30).changed).toBe(0);
  expect(diffPixels(a, b, 0).percent).toBe(50);
  expect(diffSize(6000, 4000)).toEqual({ width: 4096, height: 2731, scaled: true });
  expect(diffSize(800, 600).scaled).toBe(false);
  expect(aspectDiffers(100, 100, 100, 50)).toBe(true);
  expect(aspectDiffers(1000, 500, 2000, 1001)).toBe(false);
  expect(formatPercent(0, 100)).toBe('0.0%');
  expect(formatPercent(1, 100000)).toBe('<0.1%');
});

test('two identical images show 0.0%', async ({ page }) => {
  const errors = await open(page);
  const img = await makePng(page, { w: 200, h: 100 });
  await load(page, img, img);
  await expect(page.locator('#cmp-readout')).toContainText('0.0% of pixels differ');
  expect(await percent(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('a 10 by 10 edit is flagged, and only that block', async ({ page }) => {
  await open(page);
  const a = await makePng(page, { w: 200, h: 100 });
  const b = await makePng(page, { w: 200, h: 100, block: { x: 50, y: 40, size: 10 } });
  await load(page, a, b);
  const share = (100 / (200 * 100)) * 100;
  expect(Math.abs((await percent(page)) - share)).toBeLessThan(0.01);
  await page.locator('input[name="cmp-mode"][value="difference"]').check({ force: true }).catch(() => page.locator('label', { hasText: 'Difference' }).click());
  const px = await page.evaluate(() => {
    const c = document.getElementById('cmp-canvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!;
    const at = (x: number, y: number) => Array.from(d.getImageData(x, y, 1, 1).data);
    return { inside: at(55, 45), edge: at(59, 49), outside: at(10, 10), nearby: at(60, 45) };
  });
  expect(px.inside.slice(0, 3)).toEqual([255, 32, 96]);
  expect(px.edge.slice(0, 3)).toEqual([255, 32, 96]);
  expect(px.outside.slice(0, 3)).not.toEqual([255, 32, 96]);
  expect(px.nearby.slice(0, 3)).not.toEqual([255, 32, 96]);
});

test('the threshold ignores small differences', async ({ page }) => {
  await open(page);
  await load(page, await makePng(page, { w: 60, h: 40, flat: [100, 100, 100] }), await makePng(page, { w: 60, h: 40, flat: [110, 100, 100] }));
  expect(await percent(page)).toBe(100);
  await page.locator('#cmp-threshold').fill('10');
  await expect(page.locator('#cmp-readout')).toContainText('0.0% of pixels differ');
});

test('a different size is scaled to A, with a warning when the aspect ratio differs', async ({ page }) => {
  await open(page);
  const a = await makePng(page, { w: 200, h: 100 });
  await load(page, a, await makePng(page, { w: 400, h: 200 }));
  await expect(page.locator('#cmp-readout')).toContainText('A is 200×100 px, B is 400×200 px');
  await expect(page.locator('#cmp-warn')).toContainText('scaled to A');
  await expect(page.locator('#cmp-warn')).not.toContainText('aspect');
  await load(page, a, await makePng(page, { w: 200, h: 200 }));
  await expect(page.locator('#cmp-warn')).toContainText('different aspect ratios');
  const size = await page.evaluate(() => {
    const c = document.getElementById('cmp-canvas') as HTMLCanvasElement;
    return [c.width, c.height];
  });
  expect(size).toEqual([200, 100]);
});

test('a 24 megapixel pair is compared at 4,096 px with a note', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  const big = await makePng(page, { w: 6000, h: 4000 });
  await load(page, big, big);
  await expect(page.locator('#cmp-warn')).toContainText('4,096 px');
  const size = await page.evaluate(() => {
    const c = document.getElementById('cmp-canvas') as HTMLCanvasElement;
    return [c.width, c.height];
  });
  expect(size).toEqual([4096, 2731]);
  await expect(page.locator('#cmp-readout')).toContainText('A is 6000×4000 px');
});

test('slider, difference and fade views draw, and the difference map downloads as a PNG', async ({ page }) => {
  const errors = await open(page);
  await load(page, await makePng(page, { w: 120, h: 80, flat: [255, 0, 0] }), await makePng(page, { w: 120, h: 80, flat: [0, 0, 255] }));
  const sample = (x: number) =>
    page.evaluate((x) => {
      const c = document.getElementById('cmp-canvas') as HTMLCanvasElement;
      return Array.from(c.getContext('2d')!.getImageData(x, 40, 1, 1).data.slice(0, 3));
    }, x);
  // Slider at 50%: A on the left, B on the right.
  expect(await sample(10)).toEqual([255, 0, 0]);
  expect(await sample(110)).toEqual([0, 0, 255]);
  await page.locator('#cmp-pos').fill('100');
  expect(await sample(110)).toEqual([255, 0, 0]);
  // Fade at 0% shows A, at 100% shows B.
  await page.locator('label', { hasText: 'Fade' }).click();
  await page.locator('#cmp-pos').fill('0');
  expect(await sample(60)).toEqual([255, 0, 0]);
  await page.locator('#cmp-pos').fill('100');
  expect(await sample(60)).toEqual([0, 0, 255]);
  await page.locator('label', { hasText: 'Difference' }).click();
  expect(await sample(60)).toEqual([255, 32, 96]);

  await page.locator('#run').click();
  await expect(page.locator('#results-list .result-item')).toHaveCount(1);
  const dl = page.waitForEvent('download');
  await page.locator('#results-list .result-item').getByRole('button', { name: 'Download' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('a-difference.png');
  const png = readFileSync((await file.path())!);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([120, 80]);
  expect(errors).toEqual([]);
});

test('no request carries the images', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (r) => r.method() !== 'GET' && posts.push(r.url()));
  await open(page);
  const img = await makePng(page, { w: 100, h: 60 });
  await load(page, img, img);
  await page.locator('#run').click();
  await expect(page.locator('#results-list .result-item')).toHaveCount(1);
  expect(posts.filter((u) => !u.includes('stats.keenankaufman.com'))).toEqual([]);
});
