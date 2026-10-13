import type { BrowserContext } from '@playwright/test';

/**
 * register-sw.js skips registration under automation (navigator.webdriver). Specs that exercise the
 * service worker or its caches call this before the first navigation to opt in.
 */
export async function allowServiceWorker(context: BrowserContext) {
  await context.addInitScript(() => {
    (window as unknown as { __stayputAllowSW?: boolean }).__stayputAllowSW = true;
  });
}
