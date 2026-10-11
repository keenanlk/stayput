// Tell IndexNow engines (Bing, Yandex, Seznam, Naver) that pages changed.
// By default it submits only the pages whose lastmod changed between two commits
// (src/data/lastmod.json at --from, default HEAD~1, against --to, default HEAD),
// and at most MAX_URLS of them per ping.
// Explicit URLs submit just those. With --all --force it submits every URL in the live
// sitemap; --all on its own is refused, so a stray flag can't resubmit the whole site.
// A ping for the same set of URLs as one sent in the last 10 minutes is skipped; with
// --dedup-file=<path> the record of recent pings lives in that file (the workflow caches it).
// Usage: node scripts/indexnow.mjs [--dry-run] [--all --force] [--from=<rev>] [--to=<rev>] [--dedup-file=<path>] [https://stayput.dev/some-page ...]
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { changedUrls } from './indexnow-changes.mjs';

const site = 'https://stayput.dev';
export const MAX_URLS = 50;
export const DEDUP_WINDOW_MS = 10 * 60 * 1000;

// The lastmod map as committed at `rev`; null when that commit has none (or does not exist).
function gitMapAt(rev) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${rev}:src/data/lastmod.json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

function defaultKeyFile() {
  return readdirSync(new URL('../public/', import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
}

// Recent pings as { <hash of the sorted URL list>: sent-at ms }; anything unreadable counts as none.
function readRecent(path, now) {
  if (!path) return {};
  try {
    const recent = JSON.parse(readFileSync(path, 'utf8'));
    return Object.fromEntries(Object.entries(recent).filter(([, at]) => Number.isFinite(at) && now - at < DEDUP_WINDOW_MS));
  } catch {
    return {};
  }
}

export const urlSetHash = (urls) => createHash('sha256').update([...urls].sort().join('\n')).digest('hex');

// Returns the process exit code. `deps` lets tests stub fetch, git and the clock; nothing else is injected.
export async function main(argv, deps = {}) {
  const { fetch: doFetch = fetch, mapAt = gitMapAt, keyFile = defaultKeyFile(), now = Date.now(), log = console.log, err = console.error } = deps;
  const dryRun = argv.includes('--dry-run');
  const all = argv.includes('--all');
  const force = argv.includes('--force');
  const arg = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const explicit = argv.filter((a) => a.startsWith('https://'));
  const dedupFile = arg('dedup-file', '');

  if (all && !force) {
    err('Refusing --all without --force: it resubmits every URL in the sitemap, which engines can treat as abuse.');
    err('Run it as --all --force only when the whole site really needs recrawling. Nothing was sent.');
    return 1;
  }

  if (!keyFile) throw new Error('No IndexNow key file (32 hex chars + .txt) in public/');
  const key = keyFile.slice(0, -4);

  async function text(url) {
    const res = await doFetch(url);
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
    if (!previous) log(`No lastmod map at ${from}; treating every page as changed`);
    urls = changedUrls(previous, next, site);
    log(`${urls.length} of ${Object.keys(next).length} pages changed between ${from} and ${to}`);
    if (urls.length === 0) {
      log('No pages changed; skipping the IndexNow ping');
      return 0;
    }
    if (urls.length > MAX_URLS) {
      log(`capped: submitting the first ${MAX_URLS} of ${urls.length} changed URLs, dropped ${urls.length - MAX_URLS}`);
      urls = urls.slice(0, MAX_URLS);
    }
    if (dryRun) for (const u of urls) log(`  ${u}`);
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

  const hash = urlSetHash(urls);
  const recent = readRecent(dedupFile, now);
  if (recent[hash] !== undefined) {
    log(`skipped: duplicate (the same ${urls.length} URLs were submitted ${Math.round((now - recent[hash]) / 1000)}s ago)`);
    return 0;
  }

  const body = { host: new URL(site).host, key, keyLocation: `${site}/${keyFile}`, urlList: urls };
  log(`Submitting ${urls.length} URLs to IndexNow${dryRun ? ' (dry run)' : ''}`);
  if (dryRun) return 0;

  const res = await doFetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  // 200 = accepted, 202 = accepted pending key validation.
  log(`IndexNow responded ${res.status} ${await res.text()}`);
  if (res.status !== 200 && res.status !== 202) return 1;
  if (dedupFile) {
    mkdirSync(dirname(dedupFile), { recursive: true });
    writeFileSync(dedupFile, JSON.stringify({ ...recent, [hash]: now }));
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
