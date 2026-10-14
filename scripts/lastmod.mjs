// Per-page <lastmod> for the sitemap and dateModified in structured data.
//
// Vercel and CI build from shallow clones, so the build cannot ask git when a
// page last changed. Instead src/data/lastmod/ (committed) holds one small file
// per page, { path, date, hash }, named from the path (/tools/x -> tools__x.json,
// / -> _home.json). One file per page means a branch that adds a page only adds a
// file, and an unchanged page's file never changes, so parallel branches don't
// conflict. The hash fingerprints the content the page renders
// from: its entry in src/data/tools.ts, pairs.ts, presets.ts or guides.ts, its
// engine paragraph, and its .astro page file. The build only reads the dates.
//
// After changing a page's content, run `node scripts/lastmod.mjs`. It gives every
// page whose hash changed today's date (or --date=YYYY-MM-DD) and adds new pages.
// `node scripts/lastmod.mjs --check` (run by tests/lastmod.spec.ts, so CI) fails
// when the file is stale. Guides keep their own explicit `updated` date, which is
// shown on the page; it is the lastmod, and --check fails if the guide's content
// changed without `updated` moving forward.
//
// Runs on Node 22.18+ (it imports the .ts data files directly).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const mapDir = new URL('../src/data/lastmod/', import.meta.url);
export const fileFor = (path) => (path === '/' ? '_home' : path.slice(1).replace(/\//g, '__')) + '.json';

/** The committed per-page entries as { path: { date, hash } }. */
export function readMap(dir = mapDir) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const { path, date, hash } = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    out[path] = { date, hash };
  }
  return out;
}

/** Write `next`, touching only files whose content changed and removing files of removed pages. */
export function writeMap(next, dir = mapDir) {
  mkdirSync(dir, { recursive: true });
  const want = new Map(Object.entries(next).map(([path, e]) => [fileFor(path), JSON.stringify({ path, date: e.date, hash: e.hash }, null, 1) + '\n']));
  for (const f of readdirSync(dir)) if (f.endsWith('.json') && !want.has(f)) unlinkSync(new URL(f, dir));
  for (const [f, body] of want) {
    const u = new URL(f, dir);
    if (!existsSync(u) || readFileSync(u, 'utf8') !== body) writeFileSync(u, body);
  }
}
const root0 = new URL('../', import.meta.url);

const sha = (...parts) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 16);
const read = (root, rel) => (existsSync(new URL(rel, root)) ? readFileSync(new URL(rel, root), 'utf8') : '');

/** Hashes (and guide dates) of every page, from the sources under `root`. */
export async function computeEntries(root = root0) {
  const dir = fileURLToPath(root);
  const imp = (rel) => import(pathToFileURL(dir + rel).href);
  const { tools } = await imp('src/data/tools.ts');
  const { pairs, pairAsTool } = await imp('src/data/pairs.ts');
  const { leadFor } = await imp('src/data/leads.ts');
  const { presets, presetAsTool } = await imp('src/data/presets.ts');
  const { guides } = await imp('src/data/guides.ts');
  const { engines } = await imp('src/data/engine.ts');
  const json = JSON.stringify;
  const out = {};
  for (const t of tools) out[`/tools/${t.slug}`] = { hash: sha(json(t), json(engines[t.slug] ?? null), leadFor(t), read(root, `src/pages/tools/${t.slug}.astro`)) };
  for (const p of pairs) out[`/${p.slug}`] = { hash: sha(json(p), json(engines['convert-image'] ?? null), leadFor(pairAsTool(p), 'convert-image', 'landing')) };
  for (const p of presets) out[`/${p.slug}`] = { hash: sha(json(presetAsTool(p)), json(p.intro ?? null), json(p.defaults ?? null), json(engines[p.base] ?? null), leadFor(presetAsTool(p), p.base, 'landing')) };
  for (const g of guides) {
    const { updated, ...rest } = g;
    out[`/guides/${g.slug}`] = { hash: sha(json(rest)), date: updated };
  }
  const page = (path, file, ...extra) => (out[path] = { hash: sha(read(root, `src/pages/${file}.astro`), ...extra) });
  page('/', 'index');
  page('/guides', 'guides/index');
  page('/conversions', 'conversions/index');
  for (const name of ['about', 'press', 'privacy', 'terms', 'mcp']) page(`/${name}`, name);
  page('/licenses', 'licenses', read(root, 'src/data/licenses.json'));
  return out;
}

/**
 * Merge freshly computed entries into the committed map. Pages whose hash
 * changed (or are new) get `date`; guides use their own `updated` date.
 * Returns the new map and the problems that make --check fail.
 */
export function updateMap(previous, computed, date) {
  const next = {};
  const stale = [];
  for (const path of Object.keys(computed).sort()) {
    const c = computed[path];
    const old = previous[path];
    if (c.date) {
      // Guide: the explicit `updated` date wins, but must move when the content does.
      if (old && old.hash !== c.hash && c.date <= old.date) stale.push(`${path}: content changed, bump its \`updated\` date`);
      next[path] = { date: c.date, hash: c.hash };
    } else if (old && old.hash === c.hash) next[path] = old;
    else {
      next[path] = { date, hash: c.hash };
      stale.push(`${path}: ${old ? 'content changed' : 'new page'}`);
    }
  }
  for (const path of Object.keys(previous)) if (!(path in computed)) stale.push(`${path}: page removed`);
  for (const path of Object.keys(computed)) if (computed[path].date && previous[path]?.hash !== computed[path].hash && !stale.some((m) => m.startsWith(path + ':'))) stale.push(`${path}: hash changed`);
  return { next, stale };
}

/** Today in UTC, as YYYY-MM-DD. */
const today = () => new Date().toISOString().slice(0, 10);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const date = process.argv.find((a) => a.startsWith('--date='))?.slice(7) ?? today();
  const previous = readMap();
  const { next, stale } = updateMap(previous, await computeEntries(), date);
  if (check) {
    if (stale.length) {
      console.error(`src/data/lastmod/ is out of date:\n  ${stale.slice(0, 20).join('\n  ')}\nRun: node scripts/lastmod.mjs`);
      process.exit(1);
    }
    console.log('lastmod is up to date');
  } else {
    writeMap(next);
    console.log(`lastmod: ${Object.keys(next).length} pages, ${stale.length} updated to ${date}`);
  }
}
