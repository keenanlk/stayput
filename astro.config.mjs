// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
  },
});
