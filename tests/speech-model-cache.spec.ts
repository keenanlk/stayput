import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The Whisper model (76 MB) must be fetched once and kept in exactly one place, the cache
 * transformers.js writes, with the service worker active. Two writers storing the same file at
 * once made Chromium fail the download with net::ERR_CACHE_WRITE_FAILURE. Requests are counted
 * from context-level events, the only place a service worker's own requests show up.
 * (scripts/first-visit-models.mjs repeats this in fresh profiles, in Chromium and Chrome.)
 */
test.use({ serviceWorkers: 'allow' });

const SPOKEN = fileURLToPath(new URL('./fixtures/static/jfk.wav', import.meta.url));
const MODEL = /\/models\/whisper-base\/onnx\/.+\.onnx/;

/** Run `patch` inside every worker before its own script starts: the model is loaded there, out of reach of a page init script. */
async function patchWorkers(page: Page, patch: () => void) {
  await page.addInitScript((code) => {
    const Real = window.Worker;
    (window as unknown as { Worker: unknown }).Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        // A blob worker cannot resolve "/models/...", so its fetches get the page's origin. Messages sent
        // while the worker's own script is still loading are held back and replayed once it is.
        const src = `const nativeFetch = self.fetch.bind(self);
self.fetch = (input, init) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? ${JSON.stringify(location.origin)} + input : input, init);
(${code})();
const held = [];
const hold = (e) => { e.stopImmediatePropagation(); held.push(e.data); };
self.addEventListener('message', hold, true);
await import(${JSON.stringify(new URL(String(url), location.href).href)});
self.removeEventListener('message', hold, true);
for (const data of held) self.dispatchEvent(new MessageEvent('message', { data }));`;
        super(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { ...options, type: 'module' });
      }
    };
  }, patch.toString());
}

/** Open the home page and wait until the service worker controls it, as for a visitor who browsed first. */
async function withActiveWorker(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
}

async function transcribe(page: Page) {
  await page.goto('/tools/transcribe');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(SPOKEN);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect(page.locator('#results-list')).toContainText(/English speech/);
}

/** Which caches hold which model files. */
async function modelCaches(page: Page) {
  return page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      const hits = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname).filter((p) => p.startsWith('/models/whisper-base/onnx/'));
      if (hits.length) out[name] = hits.map((p) => p.split('/').pop()!).sort();
    }
    return out;
  });
}

test('the speech model is fetched once and stored in one cache, then works offline', async ({ page, context }) => {
  test.setTimeout(150_000);
  const requests: string[] = [];
  const failed: string[] = [];
  context.on('request', (r) => MODEL.test(r.url()) && requests.push(new URL(r.url()).pathname));
  context.on('requestfailed', (r) => MODEL.test(r.url()) && failed.push(`${r.failure()?.errorText} ${r.url()}`));
  await withActiveWorker(page);
  await transcribe(page);
  expect(failed).toEqual([]);
  expect([...requests].sort()).toEqual(['/models/whisper-base/onnx/decoder_model_merged_quantized.onnx', '/models/whisper-base/onnx/encoder_model_quantized.onnx']);
  expect(await modelCaches(page)).toEqual({ 'transformers-cache': ['decoder_model_merged_quantized.onnx', 'encoder_model_quantized.onnx'] });
  // Offline, a fresh worker loads the model from that one cache.
  await context.setOffline(true);
  await transcribe(page);
  expect(requests).toHaveLength(2);
});

test('a cache that refuses writes does not fail the run: the model still comes from the network', async ({ page, context }) => {
  test.setTimeout(150_000);
  // Every Cache API write rejects, as when storage is full or the browser aborts the write.
  await patchWorkers(page, () => {
    const refuse = () => Promise.reject(new DOMException('write failed', 'QuotaExceededError'));
    Cache.prototype.put = refuse;
    Cache.prototype.add = refuse;
  });
  const failed: string[] = [];
  context.on('requestfailed', (r) => MODEL.test(r.url()) && failed.push(r.url()));
  await withActiveWorker(page);
  await transcribe(page);
  expect(failed).toEqual([]);
  expect(await modelCaches(page)).toEqual({});
});

test('a cache that cannot be opened does not fail the run either', async ({ page }) => {
  test.setTimeout(150_000);
  await patchWorkers(page, () => {
    const open = CacheStorage.prototype.open;
    CacheStorage.prototype.open = function (name: string) {
      return name === 'transformers-cache' ? Promise.reject(new DOMException('blocked', 'SecurityError')) : open.call(this, name);
    };
  });
  await withActiveWorker(page);
  await transcribe(page);
});
