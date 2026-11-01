// Runs after `astro build`: lists the hashed assets and fonts in dist/ and writes
// them, and which file loads which, into the service worker. A visited page then gets its own on-demand
// code cached for offline use, and nothing is fetched for pages the visitor has not opened.
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
// The test-only A/B override (public/ab-force.js) ships only in builds made with STAYPUT_AB_TEST.
if (!process.env.STAYPUT_AB_TEST) await rm(new URL('ab-force.js', dist), { force: true });
const assets = [];
// The WebGPU speech worker and its own copy of transformers.js (about 0.6 MB) load only on the WebGPU path, so
// they are fetched when a computer with WebGPU first writes captions, not by every visitor's first visit. The Dolby
// (AC-3) decoder, 1.1 MB of WebAssembly, is fetched when a sound in that format is first read.
const onDemand = /^((transcribe-gpu\.worker|transformers\.web)-|mediabunny-ac3\.)[\w-]+\.js$/;
for (const f of await readdir(new URL('_astro/', dist))) if (/\.(js|mjs|css|wasm)$/.test(f) && !onDemand.test(f)) assets.push(`/_astro/${f}`);
try {
  for (const f of await readdir(new URL('fonts/', dist))) if (/\.(woff2?|ttf|otf)$/.test(f)) assets.push(`/fonts/${f}`);
} catch {
  // no fonts directory
}
assets.sort();
// For each file, the indexes of the other files it loads (imports, dynamic imports, workers, wasm, fonts).
// The service worker follows this graph from a visited page's HTML to cache what that page can run,
// instead of every page's code being fetched on install.
const index = new Map(assets.map((a, k) => [a.slice(a.lastIndexOf('/') + 1), k]));
const deps = [];
for (const a of assets) {
  const text = /\.(js|mjs|css)$/.test(a) ? await readFile(new URL(a.slice(1), dist), 'utf8') : '';
  const found = new Set();
  for (const m of text.matchAll(/[\w$-][\w$.-]*\.(?:js|mjs|css|wasm|woff2?|ttf|otf)/g)) {
    const k = index.get(m[0]);
    if (k !== undefined && assets[k] !== a) found.add(k);
  }
  deps.push([...found].sort((x, y) => x - y));
}
// Landing pages (format pairs and tool presets) pick their tool module from a table of dynamic imports
// (src/tools/landing.ts), which would link every page's code to every landing page. Take that table apart:
// each landing page gets only the files of the tool named in its data-base.
const landing = {};
const landingFile = assets.findIndex((a) => /\/_landing_\.astro_astro_type_script_index_0_lang\./.test(a));
if (landingFile < 0) throw new Error('postbuild: the landing page script was not found in dist/_astro');
{
  const text = await readFile(new URL(assets[landingFile].slice(1), dist), 'utf8');
  const list = JSON.parse(`[${text.match(/\.f=\[([^\]]*)\]/)?.[1] ?? ''}]`);
  for (const m of text.matchAll(/["']?([\w-]+)["']?:\(\)=>\w+\(\(\)=>import\(`[^`]+`\)[^,]*,__vite__mapDeps\(\[([\d,]+)\]\)\)/g)) {
    // Files kept out of the cache on purpose (on-demand workers) are not in the index and are skipped.
    landing[m[1]] = m[2].split(',').map((n) => index.get(list[Number(n)]?.slice('_astro/'.length))).filter((k) => k !== undefined);
  }
  if (Object.keys(landing).length < 10) throw new Error('postbuild: could not read the tool table out of the landing page script');
  const tableTargets = new Set(Object.values(landing).flat());
  deps[landingFile] = deps[landingFile].filter((k) => !tableTargets.has(k));
}
const swPath = new URL('sw.js', dist);
const sw = await readFile(swPath, 'utf8');
if (!sw.includes('__STAYPUT_ASSETS__') || !sw.includes('__STAYPUT_DEPS__') || !sw.includes('__STAYPUT_LANDING__')) throw new Error('sw.js has no __STAYPUT_ASSETS__ / __STAYPUT_DEPS__ placeholder');
await writeFile(swPath, sw.replace('__STAYPUT_ASSETS__', () => JSON.stringify(assets)).replace('__STAYPUT_DEPS__', () => JSON.stringify(deps)).replace('__STAYPUT_LANDING__', () => JSON.stringify(landing)));
console.log(`sw.js: ${assets.length} assets listed, ${deps.reduce((n, d) => n + d.length, 0)} dependency links`);
