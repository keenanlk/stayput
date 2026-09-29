// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

// The production origin. Change this if you deploy under a different domain.
export default defineConfig({
  site: 'https://stayput.dev',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    sitemap({ filter: (page) => !page.includes('/sw') && !page.includes('/llms') && !page.includes('/search-index') }),
    // Copy the Wasm decoders into public/vendor/ before every build and dev server,
    // however astro is invoked (see scripts/vendor.mjs).
    { name: 'stayput-vendor', hooks: { 'astro:config:setup': async () => void (await import('./scripts/vendor.mjs')) } },
  ],
  vite: {
    build: { target: 'es2022', assetsInlineLimit: 0 },
    worker: { format: 'es' },
    resolve: {
      // onnxruntime-web's default wasm entry embeds its 14 MB .wasm as a build asset, which would
      // land in /_astro/ and be precached for every visitor. This entry loads it from /vendor/
      // instead (wasmPaths in src/lib/bg.worker.ts), only when the background remover runs.
      alias: [{ find: /^onnxruntime-web\/wasm$/, replacement: fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url)) }],
    },
  },
});
