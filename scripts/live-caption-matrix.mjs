// Live first-visit test of the caption tools against a deployed site, one fresh on-disk browser
// profile per run, every URL carrying #notrack so the runs aren't counted in analytics.
//
//   node scripts/live-caption-matrix.mjs                       # full matrix against https://stayput.dev
//   node scripts/live-caption-matrix.mjs --base https://example.test --runs 1 --clips 60 --browsers chromium
//
// Options: --base URL (https://stayput.dev), --runs N per tool/clip/browser cell (3),
// --browsers chromium,chrome,pixel,webkit (all; webkit runs once per cell whatever --runs says unless
// --webkit-runs is given), --clips 60,600 (clip lengths in seconds), --tools auto-caption-video,video-to-subtitles,
// --timeout MINUTES per run (45), --out FILE (results as JSON lines, appended as each run finishes),
// --headed. Needs ffmpeg. `pixel` is Chromium with Pixel 7 emulation and 4x CPU throttling (main thread only).
// Prints one markdown row per run as it finishes and a summary table at the end.
import { chromium, webkit, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[i + 1];
};
const base = String(arg('base', 'https://stayput.dev')).replace(/\/$/, '');
const runs = Number(arg('runs', 3));
const webkitRuns = Number(arg('webkit-runs', 1));
const browsers = String(arg('browsers', 'chromium,chrome,pixel,webkit')).split(',');
const clipSeconds = String(arg('clips', '60,600')).split(',').map(Number);
const tools = String(arg('tools', 'auto-caption-video,video-to-subtitles')).split(',');
const timeout = Number(arg('timeout', 45)) * 60_000;
const out = arg('out', null);
const headed = arg('headed', false) === true;

const dir = mkdtempSync(join(tmpdir(), 'stayput-live-'));
const wav = fileURLToPath(new URL('../tests/fixtures/static/jfk.wav', import.meta.url));
if (!existsSync(wav)) throw new Error(`missing ${wav}`);
// jfk.wav (public domain speech) looped under a generated test picture.
const clips = {};
for (const s of clipSeconds) {
  clips[s] = join(dir, `speech-${s}s.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15', '-stream_loop', '-1', '-i', wav, '-t', String(s), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clips[s]]);
}

const setups = {
  chromium: { type: chromium, options: {} },
  chrome: { type: chromium, options: { channel: 'chrome' } },
  pixel: { type: chromium, options: devices['Pixel 7'], throttle: 4 },
  webkit: { type: webkit, options: {} },
};

async function run(browserName, tool, seconds, n) {
  const { type, options, throttle } = setups[browserName];
  const profile = mkdtempSync(join(tmpdir(), 'stayput-live-profile-'));
  const started = new Date();
  const t0 = Date.now();
  const row = { tool, browser: browserName, clip: `${seconds}s`, run: n, started: started.toISOString(), outcome: 'pass' };
  const console_ = [];
  const network = [];
  let context;
  try {
    context = await type.launchPersistentContext(profile, { headless: !headed, reducedMotion: 'reduce', ...options });
    context.on('requestfailed', (r) => network.push(`${r.failure()?.errorText} ${r.url()}`));
    context.on('response', (r) => r.status() >= 400 && network.push(`HTTP ${r.status()} ${r.url()}`));
    const page = context.pages()[0] ?? (await context.newPage());
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console_.push(`${m.type()}: ${m.text().slice(0, 300)}`));
    page.on('pageerror', (e) => console_.push(`pageerror: ${String(e.message).slice(0, 300)}`));
    if (throttle) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.goto(`${base}/${tool}#notrack`);
    await page.locator('#tool[data-ready="true"]').waitFor({ timeout: 120_000 });
    await page.locator('#file-input').setInputFiles(clips[seconds]);
    await page.locator('#run').click();
    // Total time includes the model download: the clock started before the page load.
    const done = await Promise.race([
      page.locator('#results.is-active').waitFor({ timeout }).then(() => 'pass'),
      page.locator('#error.is-active').waitFor({ timeout }).then(() => 'fail'),
    ]);
    row.outcome = done;
    if (done === 'fail') {
      row.error = (await page.locator('#error').innerText()).replace(/\s+/g, ' ').trim();
      row.progress = (await page.locator('#progress-text').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    }
  } catch (e) {
    row.outcome = 'fail';
    row.error = `harness: ${String(e.message).split('\n')[0]}`;
    row.progress = await context?.pages()[0]?.locator('#progress-text').innerText({ timeout: 2000 }).then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  }
  row.seconds = Math.round((Date.now() - t0) / 1000);
  if (row.outcome === 'fail') {
    row.console = console_.slice(0, 8);
    row.network = network.slice(0, 8);
  }
  await context?.close().catch(() => {});
  rmSync(profile, { recursive: true, force: true });
  return row;
}

const results = [];
console.log(`start ${new Date().toISOString()} base ${base}`);
console.log('| tool | browser | clip | run | result | seconds | error |\n|---|---|---|---|---|---|---|');
for (const browserName of browsers) {
  for (const tool of tools) {
    for (const s of clipSeconds) {
      for (let n = 1; n <= (browserName === 'webkit' ? webkitRuns : runs); n++) {
        const row = await run(browserName, tool, s, n);
        results.push(row);
        if (out) appendFileSync(out, JSON.stringify(row) + '\n');
        console.log(`| ${tool} | ${browserName} | ${row.clip} | ${n} | ${row.outcome} | ${row.seconds} | ${row.error ?? ''} |`);
        if (row.outcome === 'fail') console.log(`  details: ${JSON.stringify({ progress: row.progress, console: row.console, network: row.network })}`);
      }
    }
  }
}
rmSync(dir, { recursive: true, force: true });

console.log('\n| tool | browser | clip | passed |\n|---|---|---|---|');
for (const browserName of browsers) for (const tool of tools) for (const s of clipSeconds) {
  const mine = results.filter((r) => r.browser === browserName && r.tool === tool && r.clip === `${s}s`);
  console.log(`| ${tool} | ${browserName} | ${s}s | ${mine.filter((r) => r.outcome === 'pass').length}/${mine.length} |`);
}
process.exit(results.every((r) => r.outcome === 'pass') ? 0 : 1);
