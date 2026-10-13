// Counts the requests the site makes to its own server for a first visit and for a
// returning visitor after a deploy, service worker included. A counting proxy sits in
// front of scripts/serve.mjs, so the numbers are what a CDN would see.
//
//   node scripts/measure-requests.mjs --a <dirA> [--b <dirB>] [--page /tools/heic-to-jpg] [--port 4600]
//
// <dirA> and <dirB> are checkouts (or build copies) that each hold a built dist/ and
// scripts/serve.mjs. Without --b it measures the first visit only; with --b it then
// "deploys" B (swaps the server under the same origin) and revisits as a returning visitor.
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const dirA = arg('a');
const dirB = arg('b');
const pagePath = arg('page', '/tools/heic-to-jpg');
const port = Number(arg('port', 4600));
const upstream = port + 1;
if (!dirA) throw new Error('usage: --a <dir> [--b <dir>] [--page /path] [--port N]');

let counts = {};
let total = 0;
const bucket = (path) => {
  if (path === '/sw.js') return 'sw.js';
  if (path.startsWith('/_astro/')) return 'assets';
  if (path.startsWith('/fonts/')) return 'fonts';
  if (path.startsWith('/vendor/') || path.startsWith('/models/')) return 'decoders+models';
  if (/\.(html|json|txt|xml)$/.test(path) || !/\.[a-z0-9]+$/i.test(path)) return 'pages';
  return 'other';
};
const proxy = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (!path.startsWith('/__')) {
    total++;
    const b = bucket(path);
    counts[b] = (counts[b] ?? 0) + 1;
  }
  const up = httpRequest({ host: 'localhost', port: upstream, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 500, r.headers);
    r.pipe(res);
  });
  up.on('error', () => res.writeHead(502).end());
  req.pipe(up);
});
await new Promise((r) => proxy.listen(port, r));

let child;
async function serve(dir) {
  if (child) {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
  }
  child = spawn('node', ['scripts/serve.mjs', String(upstream)], { cwd: dir, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${upstream}/`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start: ' + dir);
}

/** Wait until the proxy has seen no request for `quiet` ms. */
async function settle(quiet = 4000, max = 60000) {
  const start = Date.now();
  let last = total;
  let since = Date.now();
  while (Date.now() - start < max) {
    await new Promise((r) => setTimeout(r, 250));
    if (total !== last) {
      last = total;
      since = Date.now();
    } else if (Date.now() - since >= quiet) return;
  }
}
function snapshot(label) {
  const out = { label, total, ...counts };
  counts = {};
  total = 0;
  console.log(JSON.stringify(out));
  return out;
}

const origin = `http://localhost:${port}`;
const userDataDir = await mkdtemp(join(tmpdir(), 'measure-'));
const results = [];
try {
  await serve(dirA);
  const ctx = await chromium.launchPersistentContext(userDataDir, { serviceWorkers: 'allow' });
  // Analytics is not part of this site's own request count.
  await ctx.route(/umami|analytics/i, (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(origin + pagePath);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await settle();
  results.push(snapshot(`first visit ${pagePath}`));
  const cached = await page.evaluate(async () => {
    const out = {};
    for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
    return out;
  });
  console.log('cache entries', JSON.stringify(cached));

  // Open a second and third page, as a returning visitor would over a few visits.
  for (const p of ['/tools/merge-pdf', '/']) {
    await page.goto(origin + p);
    await settle(2500);
  }
  results.push(snapshot('two more pages opened'));

  if (dirB) {
    await page.close();
    await serve(dirB);
    const again = await ctx.newPage();
    await again.goto(origin + pagePath);
    await again.evaluate(() => navigator.serviceWorker.ready);
    await settle();
    results.push(snapshot(`returning visit after deploy ${pagePath}`));
    await again.goto(origin + '/tools/merge-pdf');
    await settle(2500);
    results.push(snapshot('returning: second page'));
    const after = await again.evaluate(async () => {
      const out = {};
      for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
      return out;
    });
    console.log('cache entries after deploy', JSON.stringify(after));
  }
  await ctx.close();
} finally {
  child?.kill();
  proxy.close();
  await rm(userDataDir, { recursive: true, force: true });
}
