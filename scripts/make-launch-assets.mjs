// Make the launch GIF frames and the gallery screenshots from a local build.
// Usage: npm run build && node scripts/serve.mjs 4321 &  then  npm run launch-assets
// (which runs make-launch-samples.mjs/.py, this file, then make-launch-gif.py).
// Writes to launch/assets/ (git-ignored). Set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled browser.
// Set LAUNCH_FONT_DIR to a folder holding inter-400/600/700.woff2 to render with Inter
// (the site uses the system UI font; a Linux sandbox would otherwise fall back to DejaVu).
// Set LAUNCH_SHOW_HOST=stayput.dev to load the local build under that origin, so the
// request panel in the screenshots names the real host instead of localhost.
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const local = process.env.BASE_URL ?? 'http://localhost:4321';
const showHost = process.env.LAUNCH_SHOW_HOST;
const base = showHost ? `https://${showHost}` : local;
const out = fileURLToPath(new URL('../launch/assets/', import.meta.url));
const frames = out + 'frames/';
const sample = (n) => fileURLToPath(new URL(`../launch/assets/samples/${n}`, import.meta.url));
const fontDir = process.env.LAUNCH_FONT_DIR;

mkdirSync(out, { recursive: true });
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames);

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  // Hide navigator.webdriver so the site loads its usage counter as it does for
  // a visitor, and the request panel shows that ping.
  args: ['--disable-blink-features=AutomationControlled'],
});
const ctx = await browser.newContext({
  viewport: { width: 1270, height: 760 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  // Routes do not see service worker fetches, so keep the worker out when faking the host.
  serviceWorkers: showHost ? 'block' : 'allow',
});
if (showHost) {
  await ctx.route(`${base}/**`, async (r) => r.fulfill({ response: await r.fetch({ url: r.request().url().replace(base, local) }) }));
}
// The real Umami script runs, so the panel shows its ping exactly as a visitor
// sees it. The ping itself is answered here and never reaches the stats server.
await ctx.route('https://stats.keenankaufman.com/**', async (r) =>
  r.request().url().endsWith('/st.js')
    ? r.fulfill({ response: await r.fetch() })
    : r.fulfill({ contentType: 'application/json', body: '{}' }),
);
if (fontDir) {
  await ctx.route('**/__fonts/*', (r) => r.fulfill({ path: fontDir + '/' + r.request().url().split('/').pop(), contentType: 'font/woff2' }));
}
const page = await ctx.newPage();
const go = async (path) => {
  await page.goto(base + path);
  if (fontDir) {
    await page.addStyleTag({
      content: [400, 600, 700].map((w) => `@font-face{font-family:Inter;font-weight:${w};src:url(/__fonts/inter-${w}.woff2) format('woff2')}`).join('') +
        ':root{--font:Inter,ui-sans-serif,system-ui,sans-serif}',
    });
    await page.evaluate(() => document.fonts.ready);
  }
};
const shot = (name, opts = {}) => page.screenshot({ path: out + name, ...opts });
const settle = (ms = 400) => page.waitForTimeout(ms);

// 1. Home page above the fold.
await go('/');
await settle(800);
await shot('01-home.png');

// 2. Merge PDF with three files loaded.
await go('/tools/merge-pdf');
await page.locator('#file-input').setInputFiles([sample('services-agreement.pdf'), sample('schedule-a.pdf'), sample('schedule-b.pdf')]);
await page.locator('#tool[data-count="3"]').waitFor();
await settle(600);
await shot('02-merge-pdf.png');

// 3. Sign PDF: a typed signature placed on the signature line of the last page.
await go('/tools/sign-pdf');
await page.locator('#file-input').setInputFiles([sample('services-agreement.pdf')]);
await page.locator('#sign-panel').waitFor();
await settle(800);
await page.locator('#next-page').click();
await page.locator('#next-page').click();
await page.locator('#page-label').filter({ hasText: 'Page 3 of 3' }).waitFor();
await page.locator('input[name="sig-mode"][value="type"]').check({ force: true });
await page.locator('#sig-text').fill('Jordan Ellis');
await settle(300);
await page.locator('#add-signature').click();
const stamp = page.locator('.stamp-signature');
await stamp.waitFor();
await settle(300);
{
  const stage = await page.locator('#page-canvas').boundingBox();
  const b = await stamp.boundingBox();
  // The signature line sits about 78% down the page, a third of the way across.
  const targetX = stage.x + stage.width * 0.47;
  const targetY = stage.y + stage.height * 0.572;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();
  await settle(300);
  const after = await stamp.boundingBox();
  await page.evaluate((y) => window.scrollTo(0, window.scrollY + y - 420), after.y);
}
await settle(400);
await shot('03-sign-pdf.png');

// 4. Strip EXIF: result panel after a run on three photos.
await go('/tools/strip-exif');
await page.locator('#file-input').setInputFiles([sample('IMG_2841.jpg'), sample('lakeside.png'), sample('coast.webp')]);
await page.locator('#meta-report .meta-row').nth(2).waitFor();
await page.locator('#run').click();
await page.locator('#results.is-active').waitFor();
await settle(900);
await page.locator('#meta-report').scrollIntoViewIfNeeded();
await settle(300);
await shot('04-strip-exif.png');

// 5. The network proof panel, open, after a HEIC batch. Also the GIF source.
const heics = Array.from({ length: 3 }, (_, i) => sample(`IMG_${4021 + i}.HEIC`));
await go('/tools/heic-to-jpg');
await settle(600);
let n = 0;
const frame = async () => page.screenshot({ path: `${frames}f${String(n++).padStart(3, '0')}.png` });
await frame();
await frame();
await page.locator('#file-input').setInputFiles(heics);
await page.locator(`#tool[data-count="${heics.length}"]`).waitFor();
await page.evaluate(() => {
  document.getElementById('netproof').open = true;
  const q = document.getElementById('quality');
  q.value = '85';
  q.dispatchEvent(new Event('input', { bubbles: true }));
});
await settle(300);
await frame();
await frame();
await frame();
const runBtn = page.locator('#run');
await runBtn.hover();
await frame();
await runBtn.click();
// Capture the run at ~8 frames a second until done.
const done = page.locator('#results.is-active').waitFor({ timeout: 120_000 }).then(() => true);
let finished = false;
done.then(() => (finished = true));
while (!finished) {
  await frame();
  await page.waitForTimeout(120);
}
await settle(900); // let the proof panel render its list
for (let i = 0; i < 6; i++) await frame();
await page.locator('#netproof').scrollIntoViewIfNeeded();
await settle(300);
await shot('05-network-proof.png');
for (let i = 0; i < 8; i++) await frame();

// 6. Alternate: the PWA install prompt as it appears after a second run.
await page.evaluate(() => { document.getElementById('install').hidden = false; });
await page.locator('#install').scrollIntoViewIfNeeded();
await settle(300);
await shot('06-install-prompt.png');

// End card for the GIF: the hook line in the brand colours.
const endFont = fontDir
  ? `<style>${[400, 600, 700].map((w) => `@font-face{font-family:Inter;font-weight:${w};src:url(${base}/__fonts/inter-${w}.woff2) format('woff2')}`).join('')}</style>`
  : '';
await page.setContent(`<!doctype html><html><head>${endFont}</head><body style="margin:0;width:1270px;height:760px;display:grid;place-items:center;background:#F3F6F4;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#1B241F">
<div style="text-align:center">
  <svg width="60" height="74" viewBox="0 0 18 22"><circle cx="9" cy="7" r="6" fill="#1F6F50"/><rect x="7.6" y="11" width="2.8" height="10" rx="1.4" fill="#1F6F50"/></svg>
  <div style="font-size:56px;font-weight:700;letter-spacing:-.02em;margin-top:18px">Open the network tab.<br>Your files never appear in it.</div>
  <div style="font-size:26px;color:#465249;margin-top:22px">stayput.dev · free, open source, nothing uploaded</div>
</div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await settle(300);
await page.screenshot({ path: `${frames}end.png` });

await browser.close();
console.log(`wrote screenshots and ${n} frames to ${out}`);
