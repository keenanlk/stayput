// Runs after `npm run build`: reads every page in dist/ and fails if any
// internal link, asset, canonical, social image or sitemap entry points at a
// path that does not exist in the build. Links that only work through a
// vercel.json redirect are reported too, because each one costs a hop and
// search engines prefer the final URL. With --external it also requests every
// outbound link once and reports the ones that fail.
import { readdir, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const site = 'https://stayput.dev';
const checkExternal = process.argv.includes('--external');

const redirects = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8')).redirects ?? [];
const redirected = new Map(redirects.filter((r) => !r.has && !r.source.includes(':')).map((r) => [r.source, r.destination]));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/** Does this site path resolve to a file in dist/ (build.format 'file', no trailing slash)? */
function exists(path) {
  if (path === '/') return existsSync(join(dist, 'index.html'));
  const p = join(dist, decodeURIComponent(path));
  if (existsSync(p) && statSync(p).isFile()) return true;
  return existsSync(`${p}.html`);
}

function pageFile(path) {
  if (path === '/') return join(dist, 'index.html');
  const p = join(dist, decodeURIComponent(path));
  return existsSync(`${p}.html`) ? `${p}.html` : p;
}

const files = await walk(dist);
const pages = files.filter((f) => f.endsWith('.html'));
const idsByFile = new Map();
const refs = []; // { from, url, kind }

const attr = /\s(href|src|content|srcset)\s*=\s*"([^"]*)"/g;
for (const file of pages) {
  const html = await readFile(file, 'utf8');
  const from = '/' + relative(dist, file).replace(/\.html$/, '').replace(/^index$/, '');
  idsByFile.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  for (const tag of html.matchAll(/<(a|link|script|img|source|meta|iframe|video|use)\b[^>]*>/gi)) {
    const t = tag[0];
    const name = tag[1].toLowerCase();
    for (const [, key, raw] of t.matchAll(attr)) {
      if (name === 'meta' && key === 'content') {
        if (!/(property|name)="(og:image|og:url|twitter:image)"/.test(t)) continue;
      } else if (key === 'content') continue;
      const values = key === 'srcset' ? raw.split(',').map((s) => s.trim().split(/\s+/)[0]) : [raw];
      for (const v of values) if (v) refs.push({ from, url: v.replace(/&amp;/g, '&'), kind: `${name}[${key}]` });
    }
  }
  // JSON-LD urls
  for (const m of html.matchAll(/"(?:url|item|@id|image)":"(https:\/\/stayput\.dev[^"]*)"/g)) refs.push({ from, url: m[1], kind: 'json-ld' });
}

for (const f of files.filter((f) => /sitemap-\d+\.xml$/.test(f))) {
  const xml = await readFile(f, 'utf8');
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) refs.push({ from: '/' + relative(dist, f), url: m[1], kind: 'sitemap' });
}

const broken = [];
const viaRedirect = [];
const external = new Map();

for (const r of refs) {
  if (/^(mailto:|tel:|data:|javascript:|blob:)/.test(r.url)) continue;
  let u;
  try {
    u = new URL(r.url, site + r.from);
  } catch {
    broken.push({ ...r, why: 'unparseable' });
    continue;
  }
  if (u.origin !== site) {
    if (/^https?:$/.test(u.protocol)) {
      if (!external.has(u.href)) external.set(u.href, []);
      external.get(u.href).push(r.from);
    }
    continue;
  }
  const path = u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : '/';
  if (!exists(path)) {
    if (redirected.has(path) && exists(redirected.get(path))) viaRedirect.push({ ...r, to: redirected.get(path) });
    else broken.push({ ...r, why: 'no such page or file' });
    continue;
  }
  if (u.hash.length > 1 && r.kind.startsWith('a[')) {
    const ids = idsByFile.get(pageFile(path));
    if (ids && !ids.has(decodeURIComponent(u.hash.slice(1)))) broken.push({ ...r, why: `no element with id ${u.hash}` });
  }
}

const group = (list, fmt) => {
  const seen = new Map();
  for (const x of list) {
    const k = fmt(x);
    seen.set(k, [...(seen.get(k) ?? []), x.from]);
  }
  for (const [k, froms] of seen) console.log(`  ${k}\n    on ${[...new Set(froms)].slice(0, 5).join(', ')}${froms.length > 5 ? ` and ${froms.length - 5} more` : ''}`);
};

console.log(`Checked ${refs.length} links on ${pages.length} pages; ${external.size} distinct outbound URLs.`);
if (viaRedirect.length) {
  console.log(`\n${viaRedirect.length} internal links go through a redirect (link the final URL instead):`);
  group(viaRedirect, (x) => `${x.url} -> ${x.to}`);
}

// Every fixed redirect in vercel.json must land on a page that exists.
for (const [source, to] of redirected) {
  if (!to.startsWith('/')) continue;
  if (!exists(to.split(/[?#]/)[0])) broken.push({ from: 'vercel.json', url: `${source} -> ${to}`, kind: 'redirect', why: 'destination missing' });
}

let failed = broken.length > 0 || viaRedirect.length > 0;
if (broken.length) {
  console.log(`\n${broken.length} broken internal links:`);
  group(broken, (x) => `${x.url} (${x.kind}, ${x.why})`);
}

if (checkExternal) {
  const bad = [];
  await Promise.all(
    [...external.keys()].map(async (href) => {
      for (const method of ['HEAD', 'GET']) {
        try {
          const res = await fetch(href, { method, redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (link check; https://stayput.dev)' } });
          if (res.ok) return;
          if (method === 'GET') bad.push({ href, why: `HTTP ${res.status}` });
        } catch (e) {
          if (method === 'GET') bad.push({ href, why: e.cause?.code ?? e.name });
        }
      }
    }),
  );
  if (bad.length) {
    console.log(`\n${bad.length} outbound links failed:`);
    for (const b of bad) console.log(`  ${b.href} (${b.why})\n    on ${[...new Set(external.get(b.href))].slice(0, 5).join(', ')}`);
  } else console.log('\nAll outbound links answered.');
}

if (failed) process.exit(1);
console.log('\nNo broken internal links.');
