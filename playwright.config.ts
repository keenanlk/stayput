import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
    acceptDownloads: true,
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
      use: {
        browserName: 'chromium',
        // Use a preinstalled Chromium when PLAYWRIGHT_CHROMIUM_PATH is set (CI sandboxes).
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
      },
    },
  ],
});
