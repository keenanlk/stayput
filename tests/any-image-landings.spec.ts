// @webkit-project
import { test, expect, type Page, type Download } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pairs } from '../src/data/pairs';

// /image-to-jpg, /image-to-png and /jpeg-to-jpg run the image converter with the output preset.
// The pictures are built in the page (PNG, JPG) or read from tiny committed WebP and HEIC files.
const fx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));

const PAGES = {
  'image-to-jpg': {
    title: 'Convert Any Image to JPG: Free, Batch, No Upload | Stayput',
    h1: 'Convert any image to JPG',
    meta: 'Convert PNG, WebP, HEIC, GIF, BMP, AVIF or any picture to JPG in your browser. Choose the quality, batch many files. Nothing is uploaded; no watermark.',
  },
  'image-to-png': {
    title: 'Convert Any Image to PNG: Free, Batch, No Upload | Stayput',
    h1: 'Convert any image to PNG',
    meta: 'Convert JPG, WebP, HEIC, GIF, BMP, AVIF or any picture to PNG in your browser. Lossless output, batch many files. Nothing is uploaded.',
  },
  'jpeg-to-jpg': {
    title: 'JPEG to JPG Converter: Free, No Upload | Stayput',
    h1: 'Convert JPEG to JPG',
    meta: 'JPEG and JPG are the same format; only the extension differs. Convert or re-save JPEG files as .jpg in your browser, batch, no upload.',
  },
} as const;

for (const [slug, want] of Object.entries(PAGES)) {
  test(`/${slug} has its title, heading, description, canonical and one H1`, async ({ page }) => {
    const res = await page.goto(`/${slug}`);
    expect(res!.status()).toBe(200);
    await expect(page).toHaveTitle(want.title);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(want.h1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', want.meta);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stayput.dev/${slug}`);
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });
}

test('no same-format duplicate pages exist', () => {
  const slugs = pairs.map((p) => p.slug);
  for (const bad of ['jpg-to-jpg', 'png-to-png', 'jpg-to-jpeg']) expect(slugs).not.toContain(bad);
});

/** A small image the page itself can make, in the given type. */
async function make(page: Page, type: string, transparent = false) {
  const bytes = await page.evaluate(
    async ([t, alpha]) => {
      const c = new OffscreenCanvas(48, 32);
      const ctx = c.getContext('2d')!;
      if (!alpha) {
        ctx.fillStyle = '#c03030';
        ctx.fillRect(0, 0, 48, 32);
      }
      ctx.fillStyle = '#2060d0';
      ctx.fillRect(8, 8, 24, 16);
      const blob = await c.convertToBlob({ type: t as string, quality: 0.9 });
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    [type, transparent] as const,
  );
  return Buffer.from(bytes);
}

async function convert(page: Page, slug: string, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.goto(`/${slug}`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(files);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', String(files.length));
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBeGreaterThan(0);
  return downloads;
}

const read = async (d: Download) => new Uint8Array(readFileSync((await d.path())!));
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPng = (b: Uint8Array) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);

async function oneAtATime(page: Page, slug: string, file: { name: string; mimeType: string; buffer: Buffer }, ext: string, check: (b: Uint8Array) => boolean) {
  const downloads = await convert(page, slug, [file]);
  const d = downloads[0]!;
  expect(d.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
  expect(check(await read(d))).toBe(true);
}

const webp = () => ({ name: 'pic.webp', mimeType: 'image/webp', buffer: readFileSync(fx('tiny.webp')) });
const heic = () => ({ name: 'photo.heic', mimeType: 'image/heic', buffer: readFileSync(fx('tiny.heic')) });

test.describe('/image-to-jpg writes JPEG files', () => {
  test('PNG', async ({ page }) => {
    await page.goto('/image-to-jpg');
    const buffer = await make(page, 'image/png', true);
    await oneAtATime(page, 'image-to-jpg', { name: 'logo.png', mimeType: 'image/png', buffer }, 'jpg', isJpeg);
  });
  test('WebP', async ({ page }) => {
    await oneAtATime(page, 'image-to-jpg', webp(), 'jpg', isJpeg);
  });
  test('HEIC', async ({ page }) => {
    await oneAtATime(page, 'image-to-jpg', heic(), 'jpg', isJpeg);
  });
});

test.describe('/image-to-png writes PNG files', () => {
  test('JPG', async ({ page }) => {
    await page.goto('/image-to-png');
    const buffer = await make(page, 'image/jpeg');
    await oneAtATime(page, 'image-to-png', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer }, 'png', isPng);
  });
  test('WebP', async ({ page }) => {
    await oneAtATime(page, 'image-to-png', webp(), 'png', isPng);
  });
  test('HEIC', async ({ page }) => {
    await oneAtATime(page, 'image-to-png', heic(), 'png', isPng);
  });
});

test('/jpeg-to-jpg turns a .jpeg into a .jpg', async ({ page }) => {
  await page.goto('/jpeg-to-jpg');
  const buffer = await make(page, 'image/jpeg');
  await oneAtATime(page, 'jpeg-to-jpg', { name: 'holiday.jpeg', mimeType: 'image/jpeg', buffer }, 'jpg', isJpeg);
});

test('/jpeg-to-jpg says the tool re-encodes and renaming is lossless', async ({ page }) => {
  await page.goto('/jpeg-to-jpg');
  const text = await page.locator('main').innerText();
  expect(text).toMatch(/encodes? it again|compressed a second time/i);
  expect(text).toMatch(/Rename the extension/);
  expect(text).toMatch(/no quality loss/i);
});

test('the pages link to each other and to their inbound pages', async ({ page }) => {
  await page.goto('/image-to-jpg');
  await expect(page.locator('a[href="/jpeg-to-jpg"]').first()).toBeVisible();
  await page.goto('/image-to-png');
  await expect(page.locator('a[href="/image-to-jpg"]').first()).toBeVisible();
  await page.goto('/png-to-jpg');
  await expect(page.locator('a[href="/image-to-jpg"]').first()).toBeVisible();
  await expect(page.locator('a[href="/jpeg-to-jpg"]').first()).toBeVisible();
  await page.goto('/webp-to-png');
  await expect(page.locator('a[href="/image-to-png"]').first()).toBeVisible();
  // The converter's own links sit in closed FAQ items, so they are in the page but not visible.
  await page.goto('/tools/convert-image');
  expect(await page.locator('a[href="/image-to-jpg"]').count()).toBeGreaterThan(0);
  expect(await page.locator('a[href="/image-to-png"]').count()).toBeGreaterThan(0);
  expect(await page.locator('a[href="/jpeg-to-jpg"]').count()).toBeGreaterThan(0);
});
