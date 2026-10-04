import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { tools, toolPath } from '../src/data/tools';
import { guides } from '../src/data/guides';

const dist = new URL('../dist/', import.meta.url);

test('every sitemap URL is a canonical stayput.dev page', async ({ request }) => {
  const xml = readFileSync(new URL('sitemap-0.xml', dist), 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect(urls.length).toBeGreaterThan(40);
  for (const url of urls) {
    expect(url.startsWith('https://stayput.dev/')).toBe(true);
    const path = new URL(url).pathname;
    const html = await (await request.get(path)).text();
    expect(html, path).toContain(`<link rel="canonical" href="${url}">`);
    expect(html, path).not.toContain('noindex');
  }
});

test('404 page is kept out of the index', async ({ request }) => {
  const html = await (await request.get('/does-not-exist')).text();
  expect(html).toContain('<meta name="robots" content="noindex">');
  expect(html).not.toContain('rel="canonical"');
});

test('IndexNow key file serves its own key', async ({ request }) => {
  const keyFile = readdirSync(new URL('../public/', import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  expect(keyFile).toBeTruthy();
  const body = await (await request.get(`/${keyFile}`)).text();
  expect(body.trim()).toBe(keyFile!.slice(0, -4));
});

test('press page offers every logo as SVG and PNG, and the files are served', async ({ page, request }) => {
  await page.goto('/press');
  const hrefs = await page.locator('.logo-tile .dl a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  for (const name of ['wordmark-light', 'wordmark-dark', 'mark-light', 'mark-dark']) {
    expect(hrefs).toContain(`/press/stayput-${name}.svg`);
    expect(hrefs).toContain(`/press/stayput-${name}.png`);
  }
  for (const href of hrefs) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()['content-type'], href).toMatch(href.endsWith('.svg') ? /image\/svg\+xml/ : /image\/png/);
    // Outlined text only, so the wordmark looks the same without the font installed.
    if (href.endsWith('.svg')) expect(await res.text(), href).not.toContain('<text');
  }
  await expect(page.locator('footer a[href="/press"]')).toBeVisible();
});

test('llms.txt lists every tool and guide with working links', async ({ request }) => {
  const res = await request.get('/llms.txt');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/plain');
  const body = await res.text();
  expect(body.startsWith('# Stayput\n\n> ')).toBe(true);
  for (const t of tools) expect(body).toContain(`](https://stayput.dev${toolPath(t)})`);
  for (const g of guides) expect(body).toContain(`](https://stayput.dev/guides/${g.slug})`);
  const paths = [...body.matchAll(/\]\(https:\/\/stayput\.dev(\/[^)]*)\)/g)].map((m) => m[1]!);
  for (const path of new Set(paths)) expect((await request.get(path)).status(), path).toBe(200);
});

test('/tools has no page of its own: vercel.json sends it, and only it, to the tool list on the home page', async ({ request }) => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rule = vercel.redirects.find((r: { source: string }) => r.source === '/tools');
  expect(rule).toMatchObject({ destination: '/#tools', permanent: true });
  // The source is an exact path (no :param or wildcard), so /tools/<slug> is not caught, and the target section exists.
  expect(rule.source).not.toMatch(/[:*(]/);
  expect(vercel.redirects.some((r: { source: string }) => /^\/tools\/[:*(]/.test(r.source))).toBe(false);
  const home = await (await request.get('/')).text();
  expect(home).toMatch(/id="tools"/);
  // The sitemap never lists the redirecting path.
  const xml = readFileSync(new URL('sitemap-0.xml', dist), 'utf8');
  expect(xml).not.toMatch(/<loc>https:\/\/stayput\.dev\/tools\/?<\/loc>/);
  // A real tool page still loads.
  expect((await request.get('/tools/heic-to-jpg')).status()).toBe(200);
});

test('archive tool pages only claim password support for ZIP, in the visible FAQ and in the FAQPage data', async ({ request }) => {
  for (const path of ['/tools/archive-extractor', '/rar-extractor', '/open-7z-file']) {
    const html = await (await request.get(path)).text();
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!)).find((j) => j['@type'] === 'FAQPage');
    expect(ld, path).toBeTruthy();
    const answers: string[] = ld.mainEntity.map((q: { acceptedAnswer: { text: string } }) => q.acceptedAnswer.text);
    for (const a of answers) expect(html, path).toContain(a.replace(/&/g, '&amp;').replace(/’/g, '’'));
    expect(html, path).not.toMatch(/including (encrypted 7z|password-protected ones)|password-protected ones too/);
    if (path === '/tools/archive-extractor') expect(answers.join(' ')).toMatch(/ZIP files open after you enter the password.*7z and RAR archives are not supported yet/);
  }
});
