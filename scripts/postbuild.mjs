// Runs after `astro build`. Fills the service worker's manifest from dist/:
//   - the hashed scripts, styles and fonts, and for every page the ones it can load, so a
//     visit saves exactly what the tool needs offline (its "closure") and nothing else;
//   - a content hash per page, so a deploy refetches only the pages that changed;
//   - a build id, which tells an installed app that it has not saved this build yet.
// The closure is followed through every static and dynamic import, worker URL and font
// reference by file name: hashed names are unique, so any mention of one is an edge. A page
// that picks its tool at run time from a table of imports (the landing pages) is followed
// only through the entry its data-base names.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const assets = [];
for (const f of await readdir(new URL('_astro/', dist))) if (/\.(js|mjs|css|wasm)$/.test(f)) assets.push(`/_astro/${f}`);
try {
  for (const f of await readdir(new URL('fonts/', dist))) if (/\.(woff2?|ttf|otf)$/.test(f)) assets.push(`/fonts/${f}`);
} catch {
  // no fonts directory
}
assets.sort();
const index = new Map(assets.map((a, i) => [a, i]));
const byName = new Map(assets.map((a) => [a.slice(a.lastIndexOf('/') + 1), a]));

const swPath = new URL('sw.js', dist);
let sw = await readFile(swPath, 'utf8');
if (!sw.includes('__STAYPUT_MANIFEST__')) throw new Error('sw.js has no __STAYPUT_MANIFEST__ placeholder');
const pathsLine = sw.match(/^const PAGE_PATHS = (\[.*\]);\n/m);
if (!pathsLine) throw new Error('sw.js has no PAGE_PATHS line');
const pagePaths = JSON.parse(pathsLine[1]);
sw = sw.replace(/^\/\/ Read, then removed.*\n/m, '').replace(pathsLine[0], '');

// File name -> assets it mentions. A chunk with a table of dynamic imports keyed by tool name
// ("convert-image":()=>e(()=>import(`./convert-image.X.js`).then(...),__vite__mapDeps([0,1]))) also
// gets one entry per key, so a page can follow only its own.
const NAME = /[A-Za-z0-9_.@-]+\.(?:js|mjs|css|woff2?)/g;
const edges = new Map();
const tables = new Map();
for (const a of assets) {
  if (a.startsWith('/fonts/')) continue;
  const text = await readFile(new URL(a.slice(1), dist), 'utf8');
  const out = new Set();
  for (const m of text.matchAll(NAME)) {
    const hit = byName.get(m[0]);
    if (hit && hit !== a) out.add(hit);
  }
  edges.set(a, out);
  const deps = text.match(/m\.f\|\|\(m\.f=\[([^\]]*)\]\)/);
  const mapDeps = deps ? [...deps[1].matchAll(/"([^"]+)"/g)].map((m) => '/' + m[1]) : [];
  const entries = new Map();
  for (const m of text.matchAll(/(?:"([a-z0-9-]+)"|([A-Za-z_$][\w$]*)):\(\)=>\w+\(\(\)=>import\(`\.\/([^`]+)`\)[^,]*,__vite__mapDeps\(\[([\d,]+)\]\)\)/g)) {
    const own = byName.get(m[3]);
    const ids = m[4].split(',').map((i) => mapDeps[Number(i)]).filter(Boolean);
    entries.set(m[1] ?? m[2], new Set([own, ...ids].filter(Boolean)));
  }
  if (entries.size > 5) {
    // Outside the table only the static imports count: the preload list near the top names every entry's files.
    const statics = new Set([...text.matchAll(/from"\.\/([^"]+)"/g)].map((m) => byName.get(m[1])).filter(Boolean));
    tables.set(a, { entries, statics });
  }
}

function closure(roots, base) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const a = queue.pop();
    if (seen.has(a)) continue;
    seen.add(a);
    const table = tables.get(a);
    if (table && base && table.entries.has(base)) {
      // Only the module this page runs, and what it needs.
      for (const n of table.entries.get(base)) queue.push(n);
      for (const n of table.statics) queue.push(n);
      continue;
    }
    for (const n of edges.get(a) ?? []) queue.push(n);
  }
  return seen;
}

function pageFile(path) {
  if (path === '/') return 'index.html';
  if (path === '/search-index.json') return 'search-index.json';
  return path.slice(1) + '.html';
}

const pages = {};
const sets = [];
const setIds = new Map();
const closures = [];
for (const path of pagePaths) {
  const bytes = await readFile(new URL(pageFile(path), dist));
  const rev = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  let ids = [];
  if (path !== '/search-index.json') {
    const html = bytes.toString('utf8');
    const roots = [...html.matchAll(/\/(_astro\/[A-Za-z0-9_.@-]+\.(?:js|css))/g)].map((m) => '/' + m[1]).filter((a) => index.has(a));
    const base = html.match(/data-base="([^"]+)"/)?.[1];
    const seen = closure(roots, base);
    // Fonts the page's styles name are part of the closure through the edges above.
    ids = [...seen].map((a) => index.get(a)).sort((x, y) => x - y);
    closures.push(new Set(ids));
  }
  const key = ids.join(',');
  if (!setIds.has(key)) {
    setIds.set(key, sets.length);
    sets.push(ids);
  }
  pages[path] = [rev, setIds.get(key)];
}
// The shell is what every page needs.
const shell = [...closures[0]].filter((i) => closures.every((c) => c.has(i))).sort((x, y) => x - y);

const build = createHash('sha256')
  .update(JSON.stringify([assets, pages]))
  .digest('hex')
  .slice(0, 12);
const manifest = { build, assets, shell, sets, pages };
await writeFile(swPath, sw.replace('__STAYPUT_MANIFEST__', JSON.stringify(manifest)));

const sizes = sets.map((s) => s.length);
const biggest = Object.entries(pages).reduce((m, [p, [, s]]) => (sets[s].length > m[1] ? [p, sets[s].length] : m), ['', 0]);
console.log(`sw.js: ${assets.length} assets, ${pagePaths.length} pages, ${sets.length} closures (shell ${shell.length}, largest ${biggest[1]} at ${biggest[0]}, median ${sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)]})`);
