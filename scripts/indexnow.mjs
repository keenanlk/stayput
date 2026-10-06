// Tell IndexNow engines (Bing, Yandex, Seznam, Naver) that pages changed.
// By default it submits only the pages whose lastmod changed between two commits
// (src/data/lastmod.json at --from, default HEAD~1, against --to, default HEAD).
// With --all it submits every URL in the live sitemap; explicit URLs submit just those.
// Usage: node scripts/indexnow.mjs [--dry-run] [--all] [--from=<rev>] [--to=<rev>] [https://stayput.dev/some-page ...]
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { changedUrls } from './indexnow-changes.mjs';

const site = 'https://stayput.dev';
const dryRun = process.argv.includes('--dry-run');
const all = process.argv.includes('--all');
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const explicit = process.argv.slice(2).filter((a) => a.startsWith('https://'));

// The lastmod map as committed at `rev`; null when that commit has none (or does not exist).
function mapAt(rev) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${rev}:src/data/lastmod.json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

const keyFile = readdirSync(new URL('../public/', import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('No IndexNow key file (32 hex chars + .txt) in public/');
const key = keyFile.slice(0, -4);

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

// The key file must be live before engines will accept the submission.
const served = (await text(`${site}/${keyFile}`)).trim();
if (served !== key) throw new Error(`${site}/${keyFile} serves "${served}", expected the key`);

let urls = explicit;
if (urls.length === 0 && !all) {
  const [from, to] = [arg('from', 'HEAD~1'), arg('to', 'HEAD')];
  const next = mapAt(to);
  if (!next) throw new Error(`No src/data/lastmod.json at ${to}`);
  const previous = mapAt(from);
  if (!previous) console.log(`No lastmod map at ${from}; treating every page as changed`);
  urls = changedUrls(previous, next, site);
  console.log(`${urls.length} of ${Object.keys(next).length} pages changed between ${from} and ${to}`);
  if (urls.length === 0) {
    console.log('No pages changed; skipping the IndexNow ping');
    process.exit(0);
  }
  if (dryRun) for (const u of urls) console.log(`  ${u}`);
}
if (urls.length === 0) {
  const index = await text(`${site}/sitemap-index.xml`);
  for (const sitemap of index.match(/<loc>[^<]+<\/loc>/g) ?? []) {
    const xml = await text(sitemap.slice(5, -6));
    urls.push(...(xml.match(/<loc>[^<]+<\/loc>/g) ?? []).map((l) => l.slice(5, -6)));
  }
}
urls = urls.filter((u) => u.startsWith(`${site}/`));
if (urls.length === 0) throw new Error('No URLs to submit');

const body = { host: new URL(site).host, key, keyLocation: `${site}/${keyFile}`, urlList: urls };
console.log(`Submitting ${urls.length} URLs to IndexNow${dryRun ? ' (dry run)' : ''}`);
if (dryRun) process.exit(0);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});
// 200 = accepted, 202 = accepted pending key validation.
console.log(`IndexNow responded ${res.status} ${await res.text()}`);
if (res.status !== 200 && res.status !== 202) process.exit(1);
