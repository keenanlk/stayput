import { test, expect } from '@playwright/test';

const tiles: [string, string][] = [
  ['iPhone photo to JPG', '/tools/heic-to-jpg'],
  ['Shrink an image', '/tools/compress-image'],
  ['Merge PDFs', '/tools/merge-pdf'],
  ['Compress a PDF', '/tools/compress-pdf'],
  ['Remove a background', '/tools/remove-background'],
  ['Video to MP3', '/tools/video-to-mp3'],
];

test('home hero offers six starting tiles that link to their tools', async ({ page }) => {
  await page.goto('/');
  const group = page.getByRole('list', { name: 'What do you want to do? Pick one, then drop your file.' });
  const links = group.getByRole('link');
  await expect(links).toHaveCount(tiles.length);
  for (const [i, [label, href]] of tiles.entries()) {
    await expect(links.nth(i)).toHaveText(label);
    await expect(links.nth(i)).toHaveAttribute('href', href);
    const box = await links.nth(i).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('link', { name: /^See all \d+ tools$/ })).toHaveCount(1);
});

test('home lede says offline works after the first visit', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero .lede')).toContainText('It even works with the Wi-Fi off after your first visit.');
});
