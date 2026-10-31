// Runs after `astro build`: lists the hashed assets and fonts in dist/ and writes
// them into the service worker so every tool's on-demand code is cached for
// offline use on the first visit, not only the chunks that happened to load.
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
// The test-only A/B override (public/ab-force.js) ships only in builds made with STAYPUT_AB_TEST.
if (!process.env.STAYPUT_AB_TEST) await rm(new URL('ab-force.js', dist), { force: true });
const assets = [];
// The WebGPU speech worker and its own copy of transformers.js (about 0.6 MB) load only on the WebGPU path, so
// they are fetched when a computer with WebGPU first writes captions, not by every visitor's first visit.
const onDemand = /^(transcribe-gpu\.worker|transformers\.web)-[\w-]+\.js$/;
for (const f of await readdir(new URL('_astro/', dist))) if (/\.(js|mjs|css|wasm)$/.test(f) && !onDemand.test(f)) assets.push(`/_astro/${f}`);
try {
  for (const f of await readdir(new URL('fonts/', dist))) if (/\.(woff2?|ttf|otf)$/.test(f)) assets.push(`/fonts/${f}`);
} catch {
  // no fonts directory
}
assets.sort();
const swPath = new URL('sw.js', dist);
const sw = await readFile(swPath, 'utf8');
if (!sw.includes('__STAYPUT_ASSETS__')) throw new Error('sw.js has no __STAYPUT_ASSETS__ placeholder');
await writeFile(swPath, sw.replace('__STAYPUT_ASSETS__', JSON.stringify(assets)));
console.log(`sw.js: ${assets.length} assets listed for offline caching`);
