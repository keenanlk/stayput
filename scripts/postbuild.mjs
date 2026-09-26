// Runs after `astro build`: lists the hashed assets and fonts in dist/ and writes
// them into the service worker so every tool's on-demand code is cached for
// offline use on the first visit, not only the chunks that happened to load.
import { readdir, readFile, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const assets = [];
for (const f of await readdir(new URL('_astro/', dist))) if (/\.(js|mjs|css|wasm)$/.test(f)) assets.push(`/_astro/${f}`);
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
