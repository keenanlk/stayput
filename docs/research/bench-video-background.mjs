// Measures how long the Video background remover takes per minute of video, in Chromium and WebKit.
//
// Usage (from a copy of the repo that has been built, with Playwright installed):
//   node docs/research/bench-video-background.mjs --clip 720p=/path/720p.mp4 --clip 1080p=/path/1080p.mp4 \
//        [--browser chromium,webkit] [--bg blur,color] [--finder fast,edges] [--save dir] [--runs 2] [--port 4431] [--json out.json]
//
// It serves ./dist with scripts/serve.mjs, opens /video-background-remover, drops the clip, presses the button and
// times the run. Each run is a fresh browser context, so the wall time includes fetching the model from the local
// server and starting it. When the page was built with the optional timing hooks described in
// docs/research/video-background-speed-2026-10.md (window.__vbg), the per-stage totals are read out as well.
// Knobs for experiments (read by those hooks only): --model /models/x.tflite, --delegate CPU|GPU, --work 256|384|512, --every N, --skip (no model).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';

const argv = process.argv.slice(2);
const all = (name) => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]] : []));
const one = (name, d) => all(name)[0] ?? d;
const clips = all('clip').map((c) => {
  const [label, path] = c.split('=');
  return { label, path };
});
if (!clips.length) throw new Error('Give at least one --clip label=path');
const browsers = one('browser', 'chromium,webkit').split(',');
const bgs = one('bg', 'blur').split(',');
const finders = one('finder', 'fast').split(',');
const saveDir = one('save', undefined);
const runs = Number(one('runs', 2));
const port = Number(one('port', 4431));
const knobs = {
  __vbgDelegate: one('delegate', undefined),
  __vbgWork: one('work', undefined) && Number(one('work')),
  __vbgEvery: one('every', undefined) && Number(one('every')),
  __vbgModel: one('model', undefined),
  __vbgSkip: argv.includes('--skip') || undefined,
};

const server = spawn('node', ['scripts/serve.mjs', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const results = [];
try {
  for (const name of browsers) {
    const browser = await (name === 'webkit' ? webkit : chromium).launch({ headless: !argv.includes('--headed'), args: one('chromium-args', '').split(' ').filter(Boolean) });
    for (const clip of clips) {
      for (const bg of bgs) for (const finder of finders) {
        for (let run = 1; run <= runs; run++) {
          const ctx = await browser.newContext({ acceptDownloads: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
          const page = await ctx.newPage();
          await page.addInitScript((k) => {
            for (const [key, v] of Object.entries(k)) if (v !== undefined) window[key] = v;
          }, knobs);
          await page.goto(`http://localhost:${port}/tools/video-background-remover`);
          await page.locator('#tool[data-ready=true]').waitFor();
          await page.locator('#file-input').setInputFiles([clip.path]);
          await page.locator(`input[name="bg"][value="${bg}"]`).evaluate((el) => el.click());
          await page.locator(`input[name="finder"][value="${finder}"]`).evaluate((el) => el.click());
          if (bg === 'color') await page.locator('#bg-color').fill('#00ff00');
          const t0 = Date.now();
          const download = saveDir ? page.waitForEvent('download', { timeout: 0 }) : undefined;
          await page.locator('#run').click();
          await page.locator('#results.is-active').waitFor({ timeout: 3_600_000 });
          const wall = (Date.now() - t0) / 1000;
          const hooks = await page.evaluate(() => window.__vbg ?? null);
          if (download) {
            mkdirSync(saveDir, { recursive: true });
            await (await download).saveAs(`${saveDir}/${clip.label}-${bg}-${finder}-${name}.mp4`);
          }
          results.push({ browser: name, clip: clip.label, bg, finder, run, wallS: wall, hooks, ...knobs });
          console.log(name, clip.label, bg, finder, `run ${run}`, `${wall.toFixed(1)} s`, hooks ? JSON.stringify(hooks) : '');
          await ctx.close();
        }
      }
    }
    await browser.close();
  }
} finally {
  server.kill();
}
const out = one('json', undefined);
if (out) writeFileSync(out, JSON.stringify({ results }, null, 1));
