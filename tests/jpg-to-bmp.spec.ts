// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// /jpg-to-bmp writes a 24-bit BMP at the JPEG's pixel size.
const fx = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));

const bmpSize = (w: number, h: number) => 54 + Math.ceil((w * 3) / 4) * 4 * h;

test('the size formula reproduces the 12 MP figure quoted on the page', () => {
  expect(bmpSize(4000, 3000)).toBe(36_000_054);
});

function checkBmp(b: Buffer, w: number, h: number) {
  expect(b.subarray(0, 2).toString('latin1')).toBe('BM');
  expect(b.readUInt16LE(28)).toBe(24);
  expect(b.readInt32LE(18)).toBe(w);
  expect(b.readInt32LE(22)).toBe(h);
  expect(b.length).toBe(bmpSize(w, h));
}

async function convert(page: Page, name: string, buffer: Buffer) {
  await page.goto('/jpg-to-bmp');
  await expect(page).toHaveTitle('JPG to BMP Converter, 24-bit, No Upload | Stayput');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'image/jpeg', buffer });
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#run').click()]);
  expect(d.suggestedFilename()).toBe(name.replace(/\.\w+$/, '.bmp'));
  return readFileSync((await d.path())!);
}

// Widths 1..4 cover every row-padding case (3 bytes per pixel, rows padded to 4).
for (const [w, h] of [[1, 3], [2, 3], [3, 5], [4, 2], [41, 27]] as const) {
  test(`a ${w} x ${h} JPEG becomes a 24-bit BMP of 54 + padded rows x height bytes`, async ({ page }) => {
    await page.goto('/jpg-to-bmp');
    const b64 = await page.evaluate(([cw, ch]) => {
      const c = document.createElement('canvas');
      c.width = cw!;
      c.height = ch!;
      const g = c.getContext('2d')!;
      g.fillStyle = '#c33';
      g.fillRect(0, 0, cw!, ch!);
      g.fillStyle = '#39c';
      g.fillRect(0, 0, Math.ceil(cw! / 2), Math.ceil(ch! / 2));
      return c.toDataURL('image/jpeg', 0.9).split(',')[1]!;
    }, [w, h]);
    checkBmp(await convert(page, 'photo.jpg', Buffer.from(b64, 'base64')), w, h);
  });
}

test('a progressive JPEG converts', async ({ page }) => {
  checkBmp(await convert(page, 'prog.jpeg', readFileSync(fx('progressive.jpg'))), 37, 23);
});

test('a CMYK JPEG converts or shows the page’s error', async ({ page }) => {
  await page.goto('/jpg-to-bmp');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'cmyk.jpg', mimeType: 'image/jpeg', buffer: readFileSync(fx('cmyk.jpg')) });
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  const dl = page.waitForEvent('download', { timeout: 20_000 }).then((d) => d, () => null);
  await page.locator('#run').click();
  const d = await dl;
  if (d) checkBmp(readFileSync((await d.path())!), 37, 23);
  else await expect(page.locator('#tool')).toContainText(/can.t read|couldn.t|could not|not read/i);
});
