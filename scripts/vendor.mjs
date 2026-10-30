// Copies the WebAssembly decoders listed in src/data/vendor.json from node_modules
// (or, for "local" entries, a build committed in this repository) into public/vendor/<name>@<version>/, so the site serves them itself instead of
// loading them from a CDN. Runs from an integration in astro.config.mjs, so every
// `astro build` and `astro dev` gets it. The version is
// part of the path, so the files can be cached forever and an upgrade gets new URLs.
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const vendor = JSON.parse(await readFile(new URL('src/data/vendor.json', root), 'utf8'));
const out = new URL('public/vendor/', root);
await rm(out, { recursive: true, force: true });
for (const lib of Object.values(vendor)) {
  // A decoder built from source in this repository ("local") is read from that folder, not from node_modules.
  const pkgDir = new URL(lib.local ?? `node_modules/${lib.package}/`, root);
  if (!lib.local) {
    const installed = JSON.parse(await readFile(new URL('package.json', pkgDir), 'utf8')).version;
    if (installed !== lib.version) {
      throw new Error(`${lib.package} is ${installed} in node_modules but src/data/vendor.json says ${lib.version}; update one to match.`);
    }
  }
  for (const [dest, src] of Object.entries(lib.files)) {
    const target = new URL(`${vendorDir(lib)}${dest}`, out);
    await mkdir(dirname(fileURLToPath(target)), { recursive: true });
    await copyFile(new URL(src, pkgDir), target);
  }
  // Licence and notice texts that must travel with the binaries, kept in the repo.
  for (const [dest, src] of Object.entries(lib.licences ?? {})) {
    const target = new URL(`${vendorDir(lib)}${dest}`, out);
    await mkdir(dirname(fileURLToPath(target)), { recursive: true });
    await copyFile(new URL(src, root), target);
  }
}
console.log(`vendor: copied ${Object.keys(vendor).length} decoders to public/vendor/`);

function vendorDir(lib) {
  return `${lib.package.replace(/^@/, '').replace('/', '-')}@${lib.version}/`;
}
