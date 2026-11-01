// Uploads the files in dist/.cloudflare/oversize.json to R2 with wrangler, skipping any already there
// with the right size and SHA-256. Wrangler has no way to ask R2 for an object's details, so each object
// is read back and hashed: the bytes in the bucket are what gets compared, not a record of them.
// Only ever adds objects (keys include the hash), so old deploys keep working; see docs/cloudflare-cutover.md.
//
// Usage: node scripts/cloudflare-r2-upload.mjs [--local] [--persist-to=<dir>]
//   Default is the real bucket, which needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
//   --local fills the bucket `wrangler dev` uses instead.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUCKET = 'stayput-assets';

/** How a local file compares with what the bucket returned. */
export const needsUpload = (entry, remote) => !remote || remote.size !== entry.size || remote.sha256 !== entry.sha256;

/** Size and SHA-256 of an object, or null when it cannot be read (absent, most often). `run` starts wrangler. */
export function readRemote(objectPath, target, run) {
  return new Promise((resolve) => {
    const child = run(['r2', 'object', 'get', objectPath, '--pipe', target], ['ignore', 'pipe', 'ignore']);
    const hash = createHash('sha256');
    let size = 0;
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      hash.update(chunk);
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? { size, sha256: hash.digest('hex') } : null));
  });
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dist = join(root, 'dist');
  const flags = process.argv.slice(2);
  const local = flags.includes('--local');
  const target = local ? '--local' : '--remote';
  const persist = flags.filter((f) => f.startsWith('--persist-to='));
  const wrangler = join(root, 'node_modules/.bin/wrangler');
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
  const run = (args, stdio) => spawn(wrangler, [...args, ...persist], { stdio, env, cwd: root });

  const manifest = JSON.parse(await readFile(join(dist, '.cloudflare/oversize.json'), 'utf8'));
  let uploaded = 0;
  let skipped = 0;
  for (const [path, entry] of Object.entries(manifest)) {
    const objectPath = `${BUCKET}/${entry.key}`;
    if (!needsUpload(entry, await readRemote(objectPath, target, run))) {
      console.log(`unchanged ${path}`);
      skipped++;
      continue;
    }
    console.log(`uploading ${path} (${(entry.size / 1024 / 1024).toFixed(1)} MiB)`);
    const put = spawnSync(wrangler, ['r2', 'object', 'put', objectPath, `--file=${join(dist, path)}`, `--content-type=${entry.contentType}`, target, ...persist], { stdio: 'inherit', env, cwd: root });
    if (put.status !== 0) throw new Error(`Upload of ${path} failed`);
    // The Worker will be deployed on the strength of this, so check the write rather than trust it.
    if (needsUpload(entry, await readRemote(objectPath, target, run))) throw new Error(`${path} does not match after upload`);
    uploaded++;
  }
  console.log(`R2 ${local ? '(local) ' : ''}${BUCKET}: ${uploaded} uploaded, ${skipped} already there.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
