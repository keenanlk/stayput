import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The self-hosted nginx config is generated from vercel.json (scripts/nginx-conf.mjs, run by the
// Dockerfile). These tests fail if the generator stops covering something vercel.json says.

type Vercel = {
  redirects: { source: string; destination: string; permanent?: boolean; has?: unknown }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const vercel = JSON.parse(readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8')) as Vercel;
const STATS = 'https://stats.keenankaufman.com';

async function generate(analytics: boolean) {
  const mod = (await import(fileURLToPath(new URL('../scripts/nginx-conf.mjs', import.meta.url)))) as {
    buildNginxConf: (v: Vercel, o: { analytics: boolean }) => { redirects: string; security: string; cache: string };
  };
  return mod.buildNginxConf(vercel, { analytics });
}

test('every permanent redirect in vercel.json is in the generated nginx config, except the host-matched one', async () => {
  const { redirects } = await generate(true);
  const plain = vercel.redirects.filter((r) => !r.has);
  expect(plain.length).toBeGreaterThan(90);
  for (const r of plain) expect(redirects, r.source).toContain(`location = ${r.source} { return 301 "${r.destination}"; }`);
  expect(redirects.match(/^location = /gm)?.length).toBe(plain.length);
  expect(redirects).not.toContain('vercel.app');
});

test('every cache rule and the site-wide headers come through', async () => {
  const { cache, security } = await generate(true);
  const sitewide = vercel.headers.find((h) => h.source === '/(.*)')!;
  for (const h of sitewide.headers) expect(security).toContain(`add_header ${h.key} "${h.value}" always;`);
  const rules = vercel.headers.filter((h) => h.source !== '/(.*)');
  expect(rules.length).toBeGreaterThan(4);
  for (const rule of rules) {
    const prefix = rule.source.endsWith('/(.*)');
    const path = prefix ? rule.source.replace('(.*)', '') : rule.source;
    expect(cache, rule.source).toContain(`location ${prefix ? '^~' : '='} ${path} {`);
    for (const h of rule.headers) expect(cache).toContain(`add_header ${h.key} "${h.value}" always;`);
  }
  // nginx drops inherited add_header lines in a location that sets its own, so each one re-includes them.
  expect(cache.match(/include \/etc\/nginx\/stayput\/security-headers\.conf;/g)?.length).toBe(rules.length);
});

test('analytics off leaves the stats host out of the CSP, analytics on keeps vercel.json as it is', async () => {
  const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value;
  expect(csp).toContain(STATS);
  const on = await generate(true);
  const off = await generate(false);
  expect(on.security).toContain(csp);
  expect(off.security).not.toContain('stats.keenankaufman.com');
  expect(off.security).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(off.security).toContain("connect-src 'self';");
});
