// Renders a 1200x630 social image per tool page (and the site-wide one) with
// headless Chromium, from the same copy that feeds the pages. Run after
// changing src/data/tools.ts, pairs.ts, presets.ts or guides.ts:
//   node scripts/make-og.mjs
// Output: public/og.png and public/og/<slug>.png (committed; the build does
// not regenerate them).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Pull the page data out of the TypeScript sources without a build step.
const src = execSync(
  `node --input-type=module -e "
    import { tools } from './src/data/tools.ts';
    import { pairs, pairAsTool } from './src/data/pairs.ts';
    import { presets, presetAsTool } from './src/data/presets.ts';
    import { guides } from './src/data/guides.ts';
    import { ogSite, ogPills } from './src/data/og.ts';
    console.log(JSON.stringify({ ogPills, pages: [
      { slug: 'site', ...ogSite, category: 'site' },
      ...tools.map(t => ({ slug: t.slug, heading: t.heading, tagline: t.tagline, category: t.category })),
      ...pairs.map(p => { const t = pairAsTool(p); return { slug: t.slug, heading: t.heading, tagline: t.tagline, category: 'images' }; }),
      ...presets.map(p => { const t = presetAsTool(p); return { slug: t.slug, heading: t.heading, tagline: t.tagline, category: t.category }; }),
      ...guides.map(g => ({ slug: 'guide-' + g.slug, heading: g.heading, tagline: g.dek, category: 'guide' })),
    ] }));
  "`,
  { encoding: 'utf8' },
);
const { ogPills, pages } = JSON.parse(src);

const html = ({ heading, tagline, category }) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body { width: 1200px; height: 630px; background: #f7f5ef; color: #1b1f23; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "DejaVu Sans", Arial, sans-serif; position: relative; overflow: hidden; }
  .glow { position: absolute; right: -120px; top: -160px; width: 560px; height: 560px; border-radius: 50%; background: #dcefe8; }
  .brand { position: absolute; left: 72px; top: 64px; display: flex; align-items: center; gap: 16px; font-weight: 800; font-size: 34px; letter-spacing: -0.02em; }
  .brand svg { width: 52px; height: 52px; }
  .kicker { position: absolute; left: 72px; top: 150px; font-size: 22px; font-weight: 600; color: #1f6f5f; letter-spacing: 0.04em; text-transform: uppercase; }
  h1 { position: absolute; left: 72px; top: 196px; margin: 0; width: 1000px; font-size: ${heading.length > 26 ? 66 : 78}px; line-height: 1.05; letter-spacing: -0.025em; font-weight: 800; }
  p { position: absolute; left: 72px; top: ${heading.length > 26 ? 372 : 330}px; margin: 0; width: 960px; font-size: 30px; line-height: 1.35; color: #4a5057; }
  .bar { position: absolute; left: 72px; right: 72px; bottom: 56px; display: flex; gap: 14px; align-items: center; font-size: 22px; font-weight: 600; color: #145147; }
  .bar span { background: #dcefe8; padding: 8px 18px; border-radius: 999px; }
  .bar .url { margin-left: auto; background: none; color: #6f767e; font-weight: 500; }
</style></head><body>
  <div class="glow"></div>
  <div class="brand"><svg viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="8" fill="#1f6f5f"/><path d="M16 8.5c-3.6 0-6 2.6-6 5.9 0 4.2 6 9.6 6 9.6s6-5.4 6-9.6c0-3.3-2.4-5.9-6-5.9z" fill="#fff"/><circle cx="16" cy="14.3" r="2.3" fill="#1f6f5f"/></svg>Stayput</div>
  <div class="kicker">${category === 'pdf' ? 'PDF tool' : category === 'media' ? 'Video and audio tool' : category === 'images' ? 'Image tool' : category === 'guide' ? 'Guide' : 'Free file tools, in your browser'}</div>
  <h1>${esc(heading)}</h1>
  <p>${esc(tagline)}</p>
  <div class="bar">${ogPills.map((t) => `<span>${esc(t)}</span>`).join('')}<span class="url">stayput.dev</span></div>
</body></html>`;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

mkdirSync('public/og', { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const p of pages) {
  await page.setContent(html(p));
  // A short heading that still wraps at the large size would run into the tagline: use the two-line layout.
  await page.evaluate(() => {
    const h = document.querySelector('h1');
    if (h.getBoundingClientRect().height > parseFloat(getComputedStyle(h).fontSize) * 1.5 && getComputedStyle(h).fontSize === '78px') {
      h.style.fontSize = '66px';
      if (h.getBoundingClientRect().height > 66 * 1.5) document.querySelector('p').style.top = '372px';
    }
  });
  const png = await page.screenshot({ type: 'png' });
  const out = p.slug === 'site' ? 'public/og.png' : `public/og/${p.slug}.png`;
  writeFileSync(out, png);
  console.log(`${out} (${(png.length / 1024).toFixed(0)} KB)`);
}
await browser.close();
