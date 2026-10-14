import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// To run a spec on WebKit too, put `// @webkit-project` on its first line; no list to edit here.
const WEBKIT_MARKER = '// @webkit-project';
const webkitSpecs = readdirSync('./tests')
  .filter((f) => f.endsWith('.spec.ts') && readFileSync(`./tests/${f}`, 'utf8').slice(0, 400).includes(WEBKIT_MARKER))
  .map((f) => `**/${f}`);

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
    acceptDownloads: true,
    // The shell smooth-scrolls results into view after a run; a forced click
    // during that scroll lands at stale coordinates. Reduced motion makes it instant.
    reducedMotion: 'reduce',
    // Playwright's request routing does not see requests a service worker makes,
    // so the worker is off by default; the offline test turns it on.
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'node scripts/serve.mjs 4321',
    url: 'http://localhost:4321/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /firefox-smoke/,
      use: {
        browserName: 'chromium',
        // Use a preinstalled Chromium when PLAYWRIGHT_CHROMIUM_PATH is set (CI sandboxes).
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
      },
    },
    // WebKit (Safari's engine) runs the specs marked `// @webkit-project`: Safari's video encoder is the odd one out. video-background-finder is local only (Linux WebKit reads video frames back blank).
    // On in CI, or locally with PW_WEBKIT=1.
    ...(process.env.CI || process.env.PW_WEBKIT
      ? [{ name: 'webkit', testMatch: webkitSpecs, use: { browserName: 'webkit' as const } }]
      : []),
    // Firefox runs a small smoke spec only. It is on in CI, or locally with PW_FIREFOX=1
    // once `npx playwright install firefox` has been run.
    ...(process.env.CI || process.env.PW_FIREFOX
      ? [{ name: 'firefox', testMatch: /firefox-smoke/, use: { browserName: 'firefox' as const } }]
      : []),
  ],
});
