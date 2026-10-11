// Unit tests for the IndexNow scripts. No network: fetch is stubbed, and nothing here can reach
// the real endpoint. Run with `node --test scripts/` (CI does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { changedUrls } from './indexnow-changes.mjs';
import { main, MAX_URLS, urlSetHash } from './indexnow.mjs';

const site = 'https://stayput.dev';
const keyFile = `${'a'.repeat(32)}.txt`;
const entry = (hash, date = '2026-10-01') => ({ date, hash });
const pages = (n, hash = 'h') => Object.fromEntries(Array.from({ length: n }, (_, i) => [`/p${String(i).padStart(3, '0')}`, entry(hash)]));

// A fetch stand-in that serves the key file and records every other request.
function stub(sitemapUrls = []) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const ok = (body) => ({ ok: true, status: 200, text: async () => body });
    if (url === `${site}/${keyFile}`) return ok('a'.repeat(32));
    if (url === `${site}/sitemap-index.xml`) return ok('<loc>https://stayput.dev/sitemap-0.xml</loc>');
    if (url === `${site}/sitemap-0.xml`) return ok(sitemapUrls.map((u) => `<loc>${u}</loc>`).join(''));
    if (url === 'https://api.indexnow.org/indexnow') return ok('');
    throw new Error(`unexpected request ${url}`);
  };
  const submissions = () => calls.filter((c) => c.url.includes('api.indexnow.org')).map((c) => JSON.parse(c.init.body).urlList);
  return { fetch, calls, submissions };
}

// Runs main() against two lastmod maps instead of git.
async function run(argv, { previous, next, fetch, now = 1_000_000 }) {
  const out = [];
  const errs = [];
  const maps = { 'HEAD~1': previous, HEAD: next };
  const code = await main(argv, { fetch, keyFile, now, mapAt: (rev) => maps[rev] ?? null, log: (l) => out.push(l), err: (l) => errs.push(l) });
  return { code, out: out.join('\n'), errs: errs.join('\n') };
}

test('changedUrls: previous null -> every page', () => {
  assert.deepEqual(changedUrls(null, { '/': entry('a'), '/b': entry('b') }, site), [`${site}/`, `${site}/b`]);
});

test('changedUrls: only one hash changed -> one URL', () => {
  const previous = { '/a': entry('1'), '/b': entry('2') };
  assert.deepEqual(changedUrls(previous, { '/a': entry('1'), '/b': entry('3') }, site), [`${site}/b`]);
});

test('changedUrls: a changed date counts, a new page counts', () => {
  const previous = { '/a': entry('1') };
  assert.deepEqual(changedUrls(previous, { '/a': entry('1', '2026-10-02'), '/n': entry('9') }, site), [`${site}/a`, `${site}/n`]);
});

test('changedUrls: deleted page is not submitted', () => {
  assert.deepEqual(changedUrls({ '/a': entry('1'), '/gone': entry('2') }, { '/a': entry('1') }, site), []);
});

test('deploy mode: more than 50 changed -> exactly 50 submitted and "capped" logged', async () => {
  const s = stub();
  const r = await run([], { previous: null, next: pages(73), fetch: s.fetch });
  assert.equal(r.code, 0);
  assert.match(r.out, /capped.*dropped 23/);
  assert.equal(s.submissions().length, 1);
  assert.equal(s.submissions()[0].length, MAX_URLS);
});

test('deploy mode: exactly 50 changed -> all 50, no cap line', async () => {
  const s = stub();
  const r = await run([], { previous: null, next: pages(50), fetch: s.fetch });
  assert.doesNotMatch(r.out, /capped/);
  assert.equal(s.submissions()[0].length, 50);
});

test('deploy mode: one changed page -> one URL submitted', async () => {
  const s = stub();
  const r = await run([], { previous: pages(5), next: { ...pages(5), '/p002': entry('new') }, fetch: s.fetch });
  assert.equal(r.code, 0);
  assert.deepEqual(s.submissions(), [[`${site}/p002`]]);
});

test('deploy mode: a deleted page sends nothing', async () => {
  const s = stub();
  const { '/p004': _gone, ...rest } = pages(5);
  const r = await run([], { previous: pages(5), next: rest, fetch: s.fetch });
  assert.equal(r.code, 0);
  assert.match(r.out, /No pages changed/);
  assert.deepEqual(s.submissions(), []);
});

test('--all without --force is refused: non-zero, nothing fetched or sent', async () => {
  const s = stub();
  const r = await run(['--all'], { previous: null, next: pages(3), fetch: s.fetch });
  assert.equal(r.code, 1);
  assert.match(r.errs, /Refusing --all without --force/);
  assert.deepEqual(s.calls, []);
});

test('--all --force submits the whole sitemap, uncapped', async () => {
  const urls = Array.from({ length: 120 }, (_, i) => `${site}/s${i}`);
  const s = stub(urls);
  const r = await run(['--all', '--force'], { previous: null, next: pages(3), fetch: s.fetch });
  assert.equal(r.code, 0);
  assert.equal(s.submissions()[0].length, 120);
});

test('explicit URLs are submitted as given, with no cap', async () => {
  const urls = Array.from({ length: 60 }, (_, i) => `${site}/e${i}`);
  const s = stub();
  await run(urls, { previous: null, next: pages(3), fetch: s.fetch });
  assert.equal(s.submissions()[0].length, 60);
});

test('dedup: the same URL set within 10 minutes is skipped, a later one is not', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'indexnow-'));
  const file = join(dir, 'pings.json');
  const next = { ...pages(3), '/p001': entry('new') };
  const argv = [`--dedup-file=${file}`];

  const first = stub();
  await run(argv, { previous: pages(3), next, fetch: first.fetch, now: 1_000_000 });
  assert.equal(first.submissions().length, 1);
  assert.equal(Object.keys(JSON.parse(readFileSync(file, 'utf8'))).length, 1);

  const second = stub();
  const r2 = await run(argv, { previous: pages(3), next, fetch: second.fetch, now: 1_000_000 + 9 * 60_000 });
  assert.match(r2.out, /skipped: duplicate/);
  assert.deepEqual(second.submissions(), []);

  const third = stub();
  const r3 = await run(argv, { previous: pages(3), next, fetch: third.fetch, now: 1_000_000 + 11 * 60_000 });
  assert.doesNotMatch(r3.out, /skipped/);
  assert.equal(third.submissions().length, 1);
});

test('dedup: a different URL set is not skipped, and URL order does not matter', async () => {
  assert.equal(urlSetHash(['/b', '/a']), urlSetHash(['/a', '/b']));
  const dir = mkdtempSync(join(tmpdir(), 'indexnow-'));
  const file = join(dir, 'pings.json');
  writeFileSync(file, JSON.stringify({ [urlSetHash([`${site}/other`])]: 1_000_000 }));
  const s = stub();
  const r = await run([`--dedup-file=${file}`], { previous: pages(3), next: { ...pages(3), '/p001': entry('new') }, fetch: s.fetch, now: 1_000_001 });
  assert.equal(s.submissions().length, 1);
  assert.doesNotMatch(r.out, /skipped/);
});

test('dedup: a failed submission is not recorded', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'indexnow-'));
  const file = join(dir, 'pings.json');
  const s = stub();
  const failing = async (url, init) => (url.includes('api.indexnow.org') ? { ok: false, status: 429, text: async () => 'slow down' } : s.fetch(url, init));
  const r = await run([`--dedup-file=${file}`], { previous: null, next: pages(2), fetch: failing });
  assert.equal(r.code, 1);
  assert.throws(() => readFileSync(file));
});

test('CLI: `--all` alone exits non-zero before any network access', () => {
  const r = spawnSync(process.execPath, ['scripts/indexnow.mjs', '--all'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing --all without --force/);
});
