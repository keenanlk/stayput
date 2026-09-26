import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';

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
