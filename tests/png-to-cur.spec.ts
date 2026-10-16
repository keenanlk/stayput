// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// /png-to-cur writes a Windows cursor: an ICO with header type 2 and the hotspot in each entry.

/** A 128 px PNG with a transparent background and a red arrow-like triangle in the top left corner. */
async function arrowPng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#d22';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(80, 40);
    g.lineTo(40, 80);
    g.closePath();
    g.fill();
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(b64, 'base64');
}

function readCur(b: Buffer) {
  const entries = Array.from({ length: b.readUInt16LE(4) }, (_, i) => {
    const p = 6 + i * 16;
    const image = b.subarray(b.readUInt32LE(p + 12), b.readUInt32LE(p + 12) + b.readUInt32LE(p + 8));
    return { size: b[p]! || 256, x: b.readUInt16LE(p + 4), y: b.readUInt16LE(p + 6), pngWidth: image.readUInt32BE(16), pngHeight: image.readUInt32BE(20), isPng: image.subarray(1, 4).toString('latin1') === 'PNG' };
  });
  return { type: b.readUInt16LE(2), entries };
}

async function convert(page: Page, pick?: () => Promise<unknown>) {
  await page.goto('/png-to-cur');
  await expect(page).toHaveTitle('PNG to CUR Converter: Make a Windows Cursor, No Upload | Stayput');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#format')).toHaveValue('image/x-win-bitmap');
  await page.locator('#file-input').setInputFiles({ name: 'arrow.png', mimeType: 'image/png', buffer: await arrowPng(page) });
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  await expect(page.locator('#cur-preview')).toBeVisible();
  await pick?.();
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#run').click()]);
  expect(d.suggestedFilename()).toBe('arrow.cur');
  return readCur(readFileSync((await d.path())!));
}

test('the default hotspot is the top left corner of every size', async ({ page }) => {
  const cur = await convert(page);
  expect(cur.type).toBe(2);
  expect(cur.entries.map((e) => [e.size, e.x, e.y])).toEqual([[32, 0, 0], [48, 0, 0], [64, 0, 0], [128, 0, 0]]);
  for (const e of cur.entries) expect([e.isPng, e.pngWidth, e.pngHeight]).toEqual([true, e.size, e.size]);
});

test('centre puts the hotspot in the middle of each size', async ({ page }) => {
  const cur = await convert(page, () => page.locator('#hotspot').selectOption('centre'));
  expect(cur.type).toBe(2);
  expect(cur.entries.map((e) => [e.size, e.x, e.y])).toEqual([[32, 15, 15], [48, 23, 23], [64, 31, 31], [128, 63, 63]]);
});

test('exact pixels are given on the 32 px size and scaled for the others', async ({ page }) => {
  const cur = await convert(page, async () => {
    await page.locator('#hotspot').selectOption('custom');
    await page.locator('#hotspot-x').fill('5');
    await page.locator('#hotspot-y').fill('7');
  });
  expect(cur.type).toBe(2);
  expect(cur.entries.map((e) => [e.size, e.x, e.y])).toEqual([[32, 5, 7], [48, 8, 11], [64, 10, 14], [128, 20, 28]]);
});

test('a small PNG gets no size larger than itself, but always the 32 px one', async ({ page }) => {
  await page.goto('/png-to-cur');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 50;
    c.getContext('2d')!.fillRect(0, 0, 50, 50);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await page.locator('#file-input').setInputFiles({ name: 'small.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#run').click()]);
  expect(readCur(readFileSync((await d.path())!)).entries.map((e) => e.size)).toEqual([32, 48]);
});
