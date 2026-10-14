// Use this to check a shipped feature against the live site: npm run test:live -- tests/<name>.spec.ts
// It is the base config pointed at https://stayput.dev with no web server, and every browser goes through a
// local proxy that refuses the analytics host, so a live run never adds page views or events to the stats.
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Hosts the site's tracker uses (UMAMI_SRC in src/lib/analytics.ts): script and collection endpoint. */
export const LIVE_BLOCKED_HOSTS = ['stats.keenankaufman.com'];
export const LIVE_PROXY_PORT = Number(process.env.PW_LIVE_PROXY_PORT ?? 8899);

// Lets specs that need the local build or the real tracker skip themselves (read by test.skip in those specs).
process.env.PW_LIVE = '1';

export default defineConfig({
  ...base,
  webServer: undefined,
  globalSetup: './tests/live-proxy-setup.ts',
  use: {
    ...base.use,
    baseURL: 'https://stayput.dev',
    serviceWorkers: 'block',
    proxy: { server: `http://127.0.0.1:${LIVE_PROXY_PORT}` },
  },
});
