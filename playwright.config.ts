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
    // WebKit (Safari's engine) runs only the caption-encoder, video-encoder, video-to-mov, mic-verdict, mov-audio, noise-video-iphone, video-tools-iphone, handoff, psd-pairs, qr-scan-webkit, video-background-rotated, video-background-finder (local only: Linux WebKit reads video frames back blank), video-background-time-left, audio-video-backdrop, audio-split, add-text-to-gif, archive-encrypted, avi-to-mp4, flv-to-mp4, speaker-test, aiff-to-mp3 and bpm-key (the unit spec and a smoke run of the finder, since decoding differs between engines) specs: Safari's video encoder is the odd one out.
    // On in CI, or locally with PW_WEBKIT=1.
    ...(process.env.CI || process.env.PW_WEBKIT
      ? [{ name: 'webkit', testMatch: /((caption|video)-encoder|video-to-mov|wake-lock|mic-verdict|mov-audio|noise-video-iphone|video-tools-iphone|handoff\.spec|psd-pairs|qr-scan-webkit|video-background-rotated|video-background-finder|video-background-time-left|audio-video-backdrop|bpm-key|audio-split|merge-gifs|add-text-to-gif\.spec|archive-encrypted|speech-gpu-worker-kept|avi-to-mp4|support-link|flv-to-mp4|speaker-test|aiff-to-mp3|speech-odd-files|gif-speed|subtitle-converter)/, use: { browserName: 'webkit' as const } }]
      : []),
    // Firefox runs a small smoke spec only. It is on in CI, or locally with PW_FIREFOX=1
    // once `npx playwright install firefox` has been run.
    ...(process.env.CI || process.env.PW_FIREFOX
      ? [{ name: 'firefox', testMatch: /firefox-smoke/, use: { browserName: 'firefox' as const } }]
      : []),
  ],
});
