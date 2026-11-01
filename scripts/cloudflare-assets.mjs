// Prepares a built dist/ for Cloudflare Workers. Run it after `npm run build`
// (`npm run build:cloudflare` does both). vercel.json stays the source of truth; this writes:
//   dist/_redirects, dist/_headers    the same rules in Cloudflare's formats
//   dist/.assetsignore                keeps files over the 25 MiB asset limit out of the upload
//   dist/.cloudflare/oversize.json    those files' R2 keys, hashes and headers, for the Worker and
//                                     scripts/cloudflare-r2-upload.mjs
// It reads every generated rule back and fails if one is lost or changed, and fails when
// wrangler.jsonc does not route exactly the oversize paths to the Worker (--write-config updates it).
// It is not part of `npm run build`, so nothing here can stop a Vercel build.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cloudflare's per-file limit for static assets. */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const LIMITS = { redirects: 2000, redirectLine: 1000, headerRules: 100, headerLine: 2000, assetFiles: 20000, workerFirstPaths: 100 };

/** Redirects that only exist for Vercel's own hostname. Nothing else may be dropped. */
const VERCEL_ONLY_HOSTS = new Set(['stayput-nu.vercel.app']);

const isVercelOnly = (r) => Array.isArray(r.has) && r.has.length > 0 && r.has.every((h) => h.type === 'host' && VERCEL_ONLY_HOSTS.has(h.value));

const redirectStatus = (r) => r.statusCode ?? (r.permanent ? 308 : 307);

/** vercel.json redirects as { source, destination, status }, keeping Vercel's status codes (permanent is 308, not 301). */
export function convertRedirects(redirects) {
  const out = [];
  for (const r of redirects) {
    if (isVercelOnly(r)) continue;
    if (r.has || r.missing) throw new Error(`Redirect ${r.source} has a condition this script cannot convert`);
    if (/[:*()]/.test(r.source) || /\s/.test(r.source + r.destination)) throw new Error(`Redirect ${r.source} -> ${r.destination} uses a pattern this script cannot convert`);
    if (r.statusCode === undefined && r.permanent === undefined) throw new Error(`Redirect ${r.source} has no status`);
    out.push({ source: r.source, destination: r.destination, status: redirectStatus(r) });
  }
  return out;
}

/**
 * Two lines per rule. Vercel strips a trailing slash before it looks for a redirect; Cloudflare matches
 * _redirects first and exactly, so /old-page/ would be a 404 without its own line.
 */
export function renderRedirects(rules) {
  const lines = rules.flatMap((r) => [`${r.source} ${r.destination} ${r.status}`, `${r.source}/ ${r.destination} ${r.status}`]);
  return `# Generated from vercel.json by scripts/cloudflare-assets.mjs. Do not edit.\n${lines.join('\n')}\n`;
}

export function parseRedirects(text) {
  return text
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const [source, destination, status, ...rest] = l.trim().split(/\s+/);
      if (rest.length) throw new Error(`Malformed _redirects line: ${l}`);
      return { source, destination, status: Number(status) };
    });
}

/** Vercel's `/foo/(.*)` is Cloudflare's `/foo/*`; a path without a pattern is the same in both. */
export function convertHeaderSource(source) {
  const converted = source.replace(/\(\.\*\)$/, '*');
  if (/[:()]/.test(converted) || converted.indexOf('*') !== converted.lastIndexOf('*')) throw new Error(`Header rule ${source} uses a pattern this script cannot convert`);
  return converted;
}

/** Whether a Cloudflare header pattern matches a path. */
export function patternMatches(pattern, path) {
  return pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path;
}

/**
 * vercel.json header rules with Cloudflare patterns. Vercel lets a later rule replace a header;
 * Cloudflare joins both values with a comma, so two rules that could set one header differently on
 * the same path are refused rather than turned into a broken value.
 */
export function convertHeaders(rules) {
  const out = rules.map((r) => ({ pattern: convertHeaderSource(r.source), headers: r.headers.map((h) => ({ key: h.key, value: h.value })) }));
  for (const [i, a] of out.entries()) {
    for (const b of out.slice(i + 1)) {
      const overlap = patternMatches(a.pattern, b.pattern.replace(/\*$/, '')) || patternMatches(b.pattern, a.pattern.replace(/\*$/, ''));
      if (!overlap) continue;
      const clash = a.headers.find((x) => b.headers.some((y) => y.key.toLowerCase() === x.key.toLowerCase()));
      if (clash) throw new Error(`Header ${clash.key} is set by both ${a.pattern} and ${b.pattern}; Cloudflare would join the values`);
    }
  }
  return out;
}

export function renderHeaders(rules) {
  const blocks = rules.map((r) => `${r.pattern}\n${r.headers.map((h) => `  ${h.key}: ${h.value}`).join('\n')}`);
  return `# Generated from vercel.json by scripts/cloudflare-assets.mjs. Do not edit.\n${blocks.join('\n')}\n`;
}

export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    const at = line.indexOf(':');
    rules.at(-1).headers.push({ key: line.slice(0, at).trim(), value: line.slice(at + 1).trim() });
  }
  return rules;
}

/** Throws unless the generated text parses back to exactly the rules vercel.json holds. */
export function verifyRules(vercel, redirectsText, headersText) {
  const fail = (msg) => {
    throw new Error(`Rule lost in conversion: ${msg}`);
  };
  const wantRedirects = vercel.redirects.filter((r) => !isVercelOnly(r));
  const gotRedirects = parseRedirects(redirectsText);
  if (gotRedirects.length !== wantRedirects.length * 2) fail(`${wantRedirects.length} redirects in vercel.json, ${gotRedirects.length} lines in _redirects`);
  const bySource = new Map(gotRedirects.map((r) => [r.source, r]));
  if (bySource.size !== gotRedirects.length) fail('_redirects lists a source twice');
  for (const r of wantRedirects) {
    for (const source of [r.source, `${r.source}/`]) {
      const got = bySource.get(source);
      if (!got) fail(`redirect ${source}`);
      if (got.destination !== r.destination || got.status !== redirectStatus(r)) fail(`redirect ${source} became ${got.destination} ${got.status}`);
    }
  }
  const gotHeaders = parseHeaders(headersText);
  if (gotHeaders.length !== vercel.headers.length) fail(`${vercel.headers.length} header rules in vercel.json, ${gotHeaders.length} in _headers`);
  for (const rule of vercel.headers) {
    const pattern = convertHeaderSource(rule.source);
    const got = gotHeaders.find((r) => r.pattern === pattern);
    if (!got) fail(`header rule ${rule.source}`);
    if (got.headers.length !== rule.headers.length) fail(`header rule ${rule.source} has ${got.headers.length} of ${rule.headers.length} headers`);
    for (const h of rule.headers) {
      if (got.headers.find((x) => x.key === h.key)?.value !== h.value) fail(`header ${h.key} on ${rule.source}`);
    }
  }
}

/** The headers vercel.json gives a path. Rule order decides, as on Vercel. */
export function headersForPath(path, rules) {
  const out = {};
  for (const rule of rules) if (patternMatches(rule.pattern, path)) for (const h of rule.headers) out[h.key] = h.value;
  return out;
}

const CONTENT_TYPES = { '.wasm': 'application/wasm', '.webm': 'video/webm', '.mp4': 'video/mp4' };

/** What Vercel serves these as today: everything else, .onnx and .tflite among them, is octet-stream. */
export function contentTypeFor(path) {
  const ext = path.slice(path.lastIndexOf('.'));
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/** The object key: the path plus the hash, so an object is never overwritten with different bytes. */
export const r2Key = (path, sha256) => `${path.slice(1)}@${sha256}`;

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* walk(join(dir, e.name));
    else if (e.isFile()) yield join(dir, e.name);
  }
}

export const sha256File = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });

/** Every file at or over the asset limit, from what is actually in dist/, as sorted site paths. */
export async function findOversize(dist, limit = MAX_ASSET_BYTES) {
  const found = [];
  let files = 0;
  for await (const file of walk(dist)) {
    files++;
    const { size } = await stat(file);
    if (size >= limit) found.push({ path: '/' + relative(dist, file).split(sep).join('/'), file, size });
  }
  return { files, oversize: found.sort((a, b) => (a.path < b.path ? -1 : 1)) };
}

const WORKER_FIRST = /("run_worker_first"\s*:\s*)\[[^\]]*\]/;

/** The run_worker_first paths in wrangler.jsonc. */
export function readWorkerFirst(config) {
  const m = WORKER_FIRST.exec(config);
  if (!m) throw new Error('wrangler.jsonc has no run_worker_first array');
  return [...m[0].slice(m[1].length).matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

export function writeWorkerFirst(config, paths) {
  return config.replace(WORKER_FIRST, (_, head) => `${head}[\n${paths.map((p) => `      ${JSON.stringify(p)}`).join(',\n')},\n    ]`);
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dist = join(root, 'dist');
  const vercelText = await readFile(join(root, 'vercel.json'), 'utf8');
  const vercel = JSON.parse(vercelText);

  const redirects = convertRedirects(vercel.redirects);
  const headers = convertHeaders(vercel.headers);
  const redirectsText = renderRedirects(redirects);
  const headersText = renderHeaders(headers);
  verifyRules(vercel, redirectsText, headersText);
  const tooLong = (text, max) => text.split('\n').find((l) => l.length > max);
  if (redirects.length > LIMITS.redirects || tooLong(redirectsText, LIMITS.redirectLine)) throw new Error('_redirects is over a Cloudflare limit');
  if (headers.length > LIMITS.headerRules || tooLong(headersText, LIMITS.headerLine)) throw new Error('_headers is over a Cloudflare limit');

  const { files, oversize } = await findOversize(dist);
  if (files > LIMITS.assetFiles) throw new Error(`dist has ${files} files; the Workers Free limit is ${LIMITS.assetFiles}`);
  if (oversize.length > LIMITS.workerFirstPaths) throw new Error(`${oversize.length} oversize files; run_worker_first takes ${LIMITS.workerFirstPaths}`);

  const manifest = {};
  for (const f of oversize) {
    const sha256 = await sha256File(f.file);
    manifest[f.path] = { key: r2Key(f.path, sha256), size: f.size, sha256, contentType: contentTypeFor(f.path), headers: headersForPath(f.path, headers) };
    if (!/immutable/.test(manifest[f.path].headers['Cache-Control'] ?? '')) throw new Error(`${f.path} is oversize but vercel.json gives it no immutable Cache-Control`);
  }

  // wrangler.jsonc is committed, so a new or renamed big file has to be routed by a commit.
  const configPath = join(root, 'wrangler.jsonc');
  const config = await readFile(configPath, 'utf8');
  const want = oversize.map((f) => f.path);
  const have = readWorkerFirst(config);
  if (JSON.stringify([...have].sort()) !== JSON.stringify(want)) {
    if (process.argv.includes('--write-config')) {
      await writeFile(configPath, writeWorkerFirst(config, want));
      console.log('wrangler.jsonc: run_worker_first updated; commit it.');
    } else {
      const missing = want.filter((p) => !have.includes(p));
      const extra = have.filter((p) => !want.includes(p));
      throw new Error(
        `wrangler.jsonc run_worker_first does not match the oversize files in dist.\n  not routed: ${missing.join(', ') || 'none'}\n  no longer oversize: ${extra.join(', ') || 'none'}\nRun node scripts/cloudflare-assets.mjs --write-config and commit the change.`,
      );
    }
  }

  await writeFile(join(dist, '_redirects'), redirectsText);
  await writeFile(join(dist, '_headers'), headersText);
  await writeFile(join(dist, '.assetsignore'), `# Generated by scripts/cloudflare-assets.mjs: served from R2 by the Worker, or read at deploy time.\n/.cloudflare/\n${want.join('\n')}\n`);
  const manifestPath = join(dist, '.cloudflare/oversize.json');
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`Cloudflare: ${redirects.length} redirects (each with and without a trailing slash), ${headers.length} header rules, ${oversize.length} files for R2:`);
  for (const f of oversize) console.log(`  ${f.path} (${(f.size / 1024 / 1024).toFixed(1)} MiB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
