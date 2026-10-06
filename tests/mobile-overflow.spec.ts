import { test, expect } from '@playwright/test';

// The narrowest phones still in use are 320 px wide. Long <select> options and
// long unbroken text must wrap or shrink inside their column, never push the
// page sideways.
test.use({ viewport: { width: 320, height: 700 } });

const pages = [
  '/tools/passport-photo',
  '/tools/remove-silence',
  '/tools/compress-video',
  '/tools/audio-converter',
  '/tools/add-audio-to-video',
  '/tools/add-border-to-image',
  '/tools/crop-video',
  '/press',
  '/licenses',
];

for (const path of pages) {
  test(`${path} does not scroll sideways at 320 px`, async ({ page }) => {
    await page.goto(path);
    const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}
