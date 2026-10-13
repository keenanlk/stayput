import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

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
  '/tools/resize-gif',
  '/tools/crop-gif',
  '/tools/merge-gifs',
  '/tools/add-text-to-gif',
  '/tools/barcode-generator',
  '/tools/qr-code-scanner',
  '/tools/signature-maker',
  '/transparent-signature-png',
  '/qr-code-scanner-for-pc',
  '/itf-14-barcode-generator',
  '/tools/audio-splitter',
  '/tools/speaker-test',
  '/tools/bpm-key-finder',
  '/camelot-wheel',
  '/bpm-finder',
  '/csv-to-json',
  '/press',
  '/licenses',
  '/avi-to-mp4',
  '/flv-to-mp4',
];

for (const path of pages) {
  test(`${path} does not scroll sideways at 320 px`, async ({ page }) => {
    await page.goto(path);
    const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}

test('the QR scanner wraps a very long address inside the card at 320 px', async ({ page }) => {
  await page.goto('/tools/qr-code-scanner');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('./fixtures/qr/qr_long.png', import.meta.url)));
  await expect(page.locator('#qs-results .qs-address')).toContainText('utm_campaign=autumn-launch-2026');
  const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
