// Repeats a first visit to a caption tool in a fresh browser profile and reports whether the
// speech model download survived: failed requests (ERR_CACHE_WRITE_FAILURE above all), how many
// times each model file was requested, and which caches ended up holding it.
//
//   npm run build
//   STAYPUT_PROD_CACHE=1 node scripts/serve.mjs 4321 &
//   node scripts/first-visit-models.mjs --browser chromium --runs 10
//   node scripts/first-visit-models.mjs --browser chrome --tool auto-caption-video
//
// Options: --base URL (default http://localhost:4321), --browser chromium|chrome,
// --tool auto-caption-video|video-to-subtitles|all, --runs N, --seconds N (clip length, 60),
// --sw on|off (block the service worker), --warm (open the home page first and wait for the
// service worker to take control, as a visitor who browsed before using the tool), --profile (use a fresh on-disk profile, which has a real HTTP disk cache, instead of an in-memory context), --cache-dir PATH (macOS: point the browser's HTTP disk cache there and deny it every write under sandbox-exec, as a locked-down profile or full disk would), --headed.
// Requests are counted from context-level events, the only place a service worker's show up.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { chmodSync, realpathSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : (process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[i + 1]);
};
const base = arg('base', 'http://localhost:4321');
const browserName = arg('browser', 'chromium');
const toolArg = arg('tool', 'all');
const runs = Number(arg('runs', 10));
const seconds = Number(arg('seconds', 60));
const swBlocked = arg('sw', 'on') === 'off';
const warm = arg('warm', false) === true;
const onDisk = arg('profile', false) === true;
const cacheDir = arg('cache-dir', null);
const headed = arg('headed', false) === true;
const tools = toolArg === 'all' ? ['auto-caption-video', 'video-to-subtitles'] : [toolArg];

const dir = mkdtempSync(join(tmpdir(), 'stayput-first-visit-'));
const clip = join(dir, 'speech.mp4');
// jfk.wav (public domain) looped under a generated test picture.
const wav = fileURLToPath(new URL('../tests/fixtures/static/jfk.wav', import.meta.url));
if (!existsSync(wav)) throw new Error(`missing ${wav}`);
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15', '-stream_loop', '-1', '-i', wav, '-t', String(seconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);

// An executable that starts the browser under a sandbox profile denying writes to the cache directory.
let sandboxed;
if (cacheDir) {
  mkdirSync(cacheDir, { recursive: true });
  const exe = chromium.executablePath();
  const profile = join(dir, 'deny-cache-writes.sb');
  writeFileSync(profile, `(version 1)\n(allow default)\n(deny file-write* (subpath "${realpathSync(cacheDir)}") (regex #"/Default/Cache(/|$)"))\n`);
  sandboxed = join(dir, 'browser.sh');
  writeFileSync(sandboxed, `#!/bin/sh\nexec sandbox-exec -f '${profile}' '${exe}' "$@"\n`);
  chmodSync(sandboxed, 0o755);
}

const MODEL = /\/models\/whisper-base\/onnx\/.+\.onnx/;
const results = [];
for (const tool of tools) {
  for (let n = 1; n <= runs; n++) {
    // A new browser each time: a fresh profile, so no HTTP cache, Cache API or service worker survives.
    const profile = onDisk ? mkdtempSync(join(tmpdir(), 'stayput-profile-')) : null;
    const launch = { headless: !headed, ...(cacheDir && { args: [`--disk-cache-dir=${cacheDir}`], ...(browserName === 'chromium' && { executablePath: sandboxed }) }), ...(browserName === 'chrome' ? { channel: 'chrome' } : {}) };
    const contextOptions = { serviceWorkers: swBlocked ? 'block' : 'allow', reducedMotion: 'reduce', baseURL: base };
    const browser = onDisk ? null : await chromium.launch(launch);
    const context = onDisk ? await chromium.launchPersistentContext(profile, { ...launch, ...contextOptions }) : await browser.newContext(contextOptions);
    const requested = {};
    const failures = [];
    context.on('request', (r) => MODEL.test(r.url()) && (process.env.DEBUG_REQ && console.log('  req', r.method(), r.headers().range ?? '-', r.serviceWorker() ? 'from-sw' : r.frame() ? 'frame' : 'worker', r.url().split('/').pop()), 1) && (requested[new URL(r.url()).pathname.split('/').pop()] = (requested[new URL(r.url()).pathname.split('/').pop()] ?? 0) + 1));
    context.on('requestfailed', (r) => failures.push(`${r.failure()?.errorText} ${new URL(r.url()).pathname}`));
    const page = await context.newPage();
    const logs = [];
    page.on('console', (m) => m.type() === 'error' && logs.push(m.text().slice(0, 160)));
    const started = Date.now();
    let outcome = 'ok';
    let shown = '';
    try {
      if (warm && !swBlocked) {
        await page.goto('/');
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
        });
      }
      await page.goto(`/${tool}`);
      await page.locator('#tool[data-ready="true"]').waitFor();
      await page.locator('#file-input').setInputFiles(clip);
      await page.locator('#run').click();
      const done = await Promise.race([
        page.locator('#results.is-active').waitFor({ timeout: 240_000 }).then(() => 'ok'),
        page.locator('#error.is-active').waitFor({ timeout: 240_000 }).then(() => 'error'),
      ]);
      outcome = done;
      if (done === 'error') shown = (await page.locator('#error').innerText()).replace(/\s+/g, ' ').slice(0, 120);
    } catch (e) {
      outcome = `timeout: ${String(e.message).split('\n')[0]}`;
    }
    const caches = await page
      .evaluate(async () => {
        const out = {};
        for (const name of await caches.keys()) {
          const hits = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname).filter((p) => p.startsWith('/models/') && p.endsWith('.onnx'));
          if (hits.length) out[name] = hits.map((p) => p.split('/').pop());
        }
        return out;
      })
      .catch(() => ({}));
    const cacheWrite = failures.filter((f) => f.includes('ERR_CACHE_WRITE_FAILURE'));
    const row = { tool, run: n, outcome, seconds: Math.round((Date.now() - started) / 1000), requested, cacheWriteFailures: cacheWrite.length, otherFailures: failures.filter((f) => !f.includes('ERR_CACHE_WRITE_FAILURE')).slice(0, 3), caches, ...(shown && { shown }) };
    if (logs.length && outcome !== 'ok') row.console = logs.slice(0, 3);
    results.push(row);
    console.log(JSON.stringify(row));
    await (browser ?? context).close();
    if (profile) rmSync(profile, { recursive: true, force: true });
  }
}
rmSync(dir, { recursive: true, force: true });
const bad = results.filter((r) => r.outcome !== 'ok' || r.cacheWriteFailures > 0);
for (const tool of tools) {
  const mine = results.filter((r) => r.tool === tool);
  console.log(`${browserName} ${tool}${swBlocked ? ' (service worker blocked)' : ''}: ${mine.filter((r) => r.outcome === 'ok').length}/${mine.length} completed, ${mine.reduce((s, r) => s + r.cacheWriteFailures, 0)} ERR_CACHE_WRITE_FAILURE`);
}
process.exit(bad.length ? 1 : 0);
