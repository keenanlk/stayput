import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tools } from '../src/data/tools';
import { guides } from '../src/data/guides';
import { changedUrls } from '../scripts/indexnow-changes.mjs';

const dist = new URL('../dist/', import.meta.url);
const xml = readFileSync(new URL('sitemap-0.xml', dist), 'utf8');
const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
  loc: /<loc>([^<]+)<\/loc>/.exec(m[1]!)?.[1] ?? '',
  // @astrojs/sitemap writes the date as midnight UTC: 2026-10-06T00:00:00.000Z.
  lastmod: /<lastmod>(\d{4}-\d{2}-\d{2})T00:00:00\.000Z<\/lastmod>/.exec(m[1]!)?.[1],
}));
const lastmodOf = (path: string) => entries.find((e) => e.loc === `https://stayput.dev${path}`)?.lastmod;

function jsonLd(html: string, type: string): Record<string, string> {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const o = JSON.parse(m[1]!);
    if (o['@type'] === type) return o;
  }
  throw new Error(`no ${type} JSON-LD`);
}

test('every sitemap URL has a real, valid lastmod, and they are not all one value', () => {
  expect(entries.length).toBeGreaterThan(400);
  for (const e of entries) {
    expect(e.lastmod, e.loc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(e.lastmod!)), e.loc).toBe(false);
    expect(new Date(e.lastmod! + 'T00:00:00Z').toISOString().slice(0, 10), e.loc).toBe(e.lastmod);
    expect(Date.parse(e.lastmod!), `${e.loc} is in the future`).toBeLessThanOrEqual(Date.now() + 864e5);
  }
  expect(new Set(entries.map((e) => e.lastmod)).size).toBeGreaterThan(5);
});

test('src/data/lastmod.json is up to date with the page content', () => {
  // Fails when a page's content changed without running `node scripts/lastmod.mjs`.
  expect(() => execFileSync('node', ['scripts/lastmod.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
});

test('tool JSON-LD dateModified matches the sitemap lastmod', async ({ request }) => {
  for (const slug of [tools[0]!.slug, 'merge-pdf', 'jpg-to-pdf']) {
    const path = slug === 'jpg-to-pdf' ? '/jpg-to-pdf' : `/tools/${slug}`;
    const html = await (await request.get(path)).text();
    expect(jsonLd(html, 'WebApplication').dateModified, path).toBe(lastmodOf(path));
  }
});

test('guide JSON-LD dateModified matches the sitemap lastmod and the shown date', async ({ request }) => {
  for (const g of [guides[0]!, guides[guides.length - 1]!]) {
    const path = `/guides/${g.slug}`;
    const ld = jsonLd(await (await request.get(path)).text(), 'Article');
    expect(ld.dateModified, path).toBe(lastmodOf(path));
    expect(ld.dateModified, path).toBe(g.updated);
    expect(ld.datePublished, path).toBeTruthy();
  }
});

test('changedUrls picks only new or changed pages', () => {
  const site = 'https://stayput.dev';
  const prev = { '/': { date: '2026-10-01', hash: 'a' }, '/tools/a': { date: '2026-10-01', hash: 'b' }, '/tools/b': { date: '2026-10-01', hash: 'c' }, '/gone': { date: '2026-10-01', hash: 'd' } };
  const next = { '/': { date: '2026-10-01', hash: 'a' }, '/tools/a': { date: '2026-10-06', hash: 'b2' }, '/tools/b': { date: '2026-10-01', hash: 'c' }, '/tools/new': { date: '2026-10-06', hash: 'e' } };
  expect(changedUrls(prev, next, site)).toEqual([`${site}/tools/a`, `${site}/tools/new`]);
  expect(changedUrls(prev, prev, site)).toEqual([]);
  expect(changedUrls(null, { '/': { date: 'x', hash: 'a' } }, site)).toEqual([`${site}/`]);
});
