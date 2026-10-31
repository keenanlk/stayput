// Writes src/data/model-manifest.json: the size and SHA-256 of every model file under public/models/,
// keyed by the path the site serves it at. The browser checks a downloaded or kept model against it
// before using it (src/lib/model-fetch.ts). Runs first in `npm run build`; `--check` only compares.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/models/', import.meta.url));
const out = fileURLToPath(new URL('../src/data/model-manifest.json', import.meta.url));

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* walk(dir + e.name + '/');
    else if (e.name !== 'README.md' && !e.name.startsWith('.')) yield dir + e.name;
  }
}

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });

export async function buildManifest() {
  const entries = {};
  for await (const file of walk(root)) {
    entries['/models/' + file.slice(root.length)] = { size: (await stat(file)).size, sha256: await sha256(file) };
  }
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : 1)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = JSON.stringify(await buildManifest(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    const kept = await readFile(out, 'utf8').catch(() => '');
    if (kept !== text) {
      console.error('src/data/model-manifest.json is out of date: run node scripts/model-manifest.mjs');
      process.exit(1);
    }
  } else {
    await writeFile(out, text);
    console.log(`model-manifest.json: ${text.split('"size"').length - 1} files`);
  }
}
