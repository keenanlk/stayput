// Rasterizes the brand SVGs in public/press/ (made by scripts/make-brand.py)
// into transparent PNGs for directory and launch forms that refuse SVG:
//   node scripts/make-brand-png.mjs
// Output is committed next to the SVGs; the build does not regenerate it.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const dir = new URL('../public/press/', import.meta.url);
const jobs = [
  ['stayput-mark-light', 1024],
  ['stayput-mark-dark', 1024],
  ['stayput-wordmark-light', 448],
  ['stayput-wordmark-dark', 448],
];

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [name, height] of jobs) {
  const svg = readFileSync(new URL(`${name}.svg`, dir), 'utf8');
  const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
  const width = Math.round((w / h) * height);
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`,
  );
  await page.locator('svg').screenshot({ path: new URL(`${name}.png`, dir).pathname, omitBackground: true });
  console.log(`wrote ${name}.png (${width}x${height})`);
}
await browser.close();
