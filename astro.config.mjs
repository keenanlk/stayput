// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The production origin. Change this if you deploy under a different domain.
export default defineConfig({
  site: 'https://stayput.app',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap({ filter: (page) => !page.includes('/sw') })],
  vite: {
    build: { target: 'es2022', assetsInlineLimit: 0 },
    worker: { format: 'es' },
  },
});
