// Title check for every sitemap page: <title> must be 30-65 characters and
// unique. By default reads the built dist/ (run after `npm run build`); with
// --base=https://stayput.dev it fetches the sitemap and every page from that
// site instead. Exits 1 and lists the offenders when anything fails.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN = 30;
const MAX = 65;
// Short on purpose: these four are not search targets.
export const SHORT_ALLOWED = new Set(['/about', '/privacy', '/terms', '/licenses']);

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const baseArg = process.argv.find((a) => a.startsWith('--base='));
const base = baseArg ? baseArg.slice('--base='.length).replace(/\/$/, '') : null;

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
const pathOf = (u) => {
  const p = new URL(u).pathname.replace(/\/$/, '');
  return p === '' ? '/' : p;
};

async function getText(pathOrUrl) {
  if (base) {
    const res = await fetch(pathOrUrl);
    if (!res.ok) throw new Error(`${pathOrUrl} -> ${res.status}`);
    return res.text();
  }
  return readFile(pathOrUrl, 'utf8');
}

async function sitemapPaths() {
  const idx = base ? `${base}/sitemap-index.xml` : join(dist, 'sitemap-index.xml');
  const out = new Set();
  for (const sm of locs(await getText(idx))) {
    const src = base ? `${base}${pathOf(sm)}` : join(dist, pathOf(sm));
    for (const u of locs(await getText(src))) out.add(pathOf(u));
  }
  return [...out].sort();
}

function builtFile(p) {
  if (p === '/') return join(dist, 'index.html');
  for (const c of [join(dist, p.slice(1) + '.html'), join(dist, p.slice(1), 'index.html')]) if (existsSync(c)) return c;
  return null;
}

async function titleOf(p) {
  let html;
  if (base) html = await getText(base + p);
  else {
    const f = builtFile(p);
    if (!f) throw new Error(`no built file for ${p}`);
    html = await readFile(f, 'utf8');
  }
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]).trim() : '';
}

const paths = await sitemapPaths();
const titles = new Map();
const problems = [];
let next = 0;
async function worker() {
  while (next < paths.length) {
    const p = paths[next++];
    try {
      titles.set(p, await titleOf(p));
    } catch (e) {
      problems.push(`${p}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: base ? 8 : 1 }, worker));

const seen = new Map();
for (const [p, t] of [...titles].sort()) {
  const n = [...t].length;
  if (SHORT_ALLOWED.has(p)) {
    if (n === 0) problems.push(`${p}: no <title>`);
  } else if (n > MAX) problems.push(`${p}: ${n} characters, over ${MAX}: ${t}`);
  else if (n < MIN) problems.push(`${p}: ${n} characters, under ${MIN}: ${t}`);
  if (!seen.has(t)) seen.set(t, []);
  seen.get(t).push(p);
}
for (const [t, ps] of seen) if (t && ps.length > 1) problems.push(`duplicate title "${t}": ${ps.join(', ')}`);

console.log(`Checked ${titles.size} of ${paths.length} sitemap pages${base ? ` on ${base}` : ' in dist/'}.`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('All titles are 30-65 characters and unique.');
