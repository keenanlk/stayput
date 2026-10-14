// @webkit-project
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// /heif-to-png writes a valid PNG with the source's pixel size from .heif and .heic input.
const fx = fileURLToPath(new URL('./fixtures/static/tiny.heic', import.meta.url));

for (const name of ['photo.heif', 'photo.heic']) {
  test(`${name} becomes a PNG at the source size`, async ({ page }) => {
    await page.goto('/heif-to-png');
    await expect(page).toHaveTitle('HEIF to PNG Converter, Free, No Upload | Stayput');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles({ name, mimeType: 'image/heif', buffer: readFileSync(fx) });
    await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#run').click()]);
    expect(d.suggestedFilename()).toBe('photo.png');
    const b = readFileSync((await d.path())!);
    expect([...b.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(b.readUInt32BE(16)).toBe(96);
    expect(b.readUInt32BE(20)).toBe(64);
  });
}
