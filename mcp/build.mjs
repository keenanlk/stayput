// Bundle the server into dist/index.js. The PDF and metadata code comes
// straight from the site (../src/lib); npm packages stay external and are
// installed as this package's dependencies.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const local = (p) => fileURLToPath(new URL(p, import.meta.url));
// pdf.ts imports these for browser-only paths: swap in Node versions.
const swaps = { './unlock': local('./src/unlock.ts'), './image': local('./src/no-canvas.ts') };
const deps = Object.keys(JSON.parse(readFileSync(local('./package.json'), 'utf8')).dependencies);

const result = await build({
  metafile: true,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'warning',
  plugins: [
    {
      // The site loads qpdf with a <script> tag and draws with <canvas>; in
      // Node, pdf.ts gets versions without either.
      name: 'node-swaps',
      setup(b) {
        b.onResolve({ filter: /^\.\/(unlock|image)$/ }, (args) => (args.importer.endsWith('/src/lib/pdf.ts') ? { path: swaps[args.path] } : undefined));
      },
    },
  ],
});

// Every package the bundle imports must be a dependency, or the published
// server fails on start with ERR_MODULE_NOT_FOUND.
const builtin = (p) => p.startsWith('node:');
const pkg = (p) => (p.startsWith('@') ? p.split('/').slice(0, 2).join('/') : p.split('/')[0]);
const missing = new Set();
for (const out of Object.values(result.metafile.outputs)) for (const imp of out.imports) if (imp.external && !builtin(imp.path) && !deps.includes(pkg(imp.path))) missing.add(imp.path);
if (missing.size) throw new Error(`dist/index.js imports packages that are not dependencies: ${[...missing].join(', ')}`);
