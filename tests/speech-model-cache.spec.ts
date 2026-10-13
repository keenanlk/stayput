import { test, expect, type Page } from '@playwright/test';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { allowServiceWorker } from './allow-sw';

/**
 * The Whisper model (76 MB) must be fetched once and kept in exactly one place, the cache
 * transformers.js writes, with the service worker active. Two writers storing the same file at
 * once made Chromium fail the download with net::ERR_CACHE_WRITE_FAILURE. Requests are counted
 * from context-level events, the only place a service worker's own requests show up.
 * (scripts/first-visit-models.mjs repeats this in fresh profiles, in Chromium and Chrome.)
 */
test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ context }) => allowServiceWorker(context));

const SPOKEN = fileURLToPath(new URL('./fixtures/static/jfk.wav', import.meta.url));
/** Chromium reports a body the page took over after its last byte as aborted; the bytes were all there. These tests watch for failed writes. */
const ABORTED = /ERR_ABORTED/;
const MODEL = /\/models\/whisper-base\/onnx\/.+\.onnx/;

/** Run `patch` inside every worker before its own script starts: the model is loaded there, out of reach of a page init script. */
async function patchWorkers(page: Page, patch: () => void) {
  await page.addInitScript((code) => {
    const Real = window.Worker;
    (window as unknown as { Worker: unknown }).Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        // A blob worker cannot resolve "/models/...", so its fetches and cache keys get the page's origin. Messages sent
        // while the worker's own script is still loading are held back and replayed once it is.
        const src = `const nativeFetch = self.fetch.bind(self);
self.fetch = (input, init) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? ${JSON.stringify(location.origin)} + input : input, init);
for (const method of ['put', 'match']) {
  const native = Cache.prototype[method];
  Cache.prototype[method] = function (key, ...rest) {
    return native.call(this, typeof key === 'string' && key.startsWith('/') ? ${JSON.stringify(location.origin)} + key : key, ...rest);
  };
}
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
  context.on('requestfailed', (r) => MODEL.test(r.url()) && !ABORTED.test(r.failure()?.errorText ?? '') && failed.push(`${r.failure()?.errorText} ${r.url()}`));
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
  context.on('requestfailed', (r) => MODEL.test(r.url()) && !ABORTED.test(r.failure()?.errorText ?? '') && failed.push(r.url()));
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

const ENCODER = 'encoder_model_quantized.onnx';

/** Sizes of the kept model files, by file name. */
async function cachedSizes(page: Page) {
  return page.evaluate(async () => {
    const cache = await caches.open('transformers-cache');
    const out: Record<string, number> = {};
    for (const req of await cache.keys()) {
      if (/\.onnx$/.test(req.url)) out[req.url.split('/').pop()!] = (await (await cache.match(req))!.blob()).size;
    }
    return out;
  });
}

/** Replace the kept encoder with `make(originalSize)` bytes, still claiming the original length. */
async function damageEncoder(page: Page, mode: 'truncated' | 'garbage') {
  await page.evaluate(async ({ mode, name }) => {
    const cache = await caches.open('transformers-cache');
    const req = (await cache.keys()).find((r) => r.url.endsWith(name))!;
    const old = await cache.match(req);
    const size = (await old!.blob()).size;
    const bytes = mode === 'truncated' ? new Uint8Array(size >> 1).fill(7) : new Uint8Array(size).fill(7);
    await cache.put(req, new Response(bytes, { headers: { 'content-length': String(size), 'content-type': 'application/octet-stream' } }));
  }, { mode, name: ENCODER });
}

test('a download that drops part way is resumed and the run finishes', async ({ page, context }) => {
  test.setTimeout(150_000);
  // The first encoder response dies after 1 MB, as a lost connection would.
  await patchWorkers(page, () => {
    const real = self.fetch;
    let cut = false;
    self.fetch = async (input, init) => {
      const res = await real(input, init);
      if (cut || !/encoder_model_quantized\.onnx/.test(String(input)) || !res.body) return res;
      cut = true;
      const reader = res.body.getReader();
      let sent = 0;
      const body = new ReadableStream<Uint8Array>({
        async pull(c) {
          if (sent >= 1_000_000) return c.error(new TypeError('network error'));
          const { done, value } = await reader.read();
          if (done) return c.close();
          sent += value.byteLength;
          c.enqueue(value);
        },
      });
      return new Response(body, { status: res.status, headers: res.headers });
    };
  });
  // The test server cannot serve ranges, so the file comes again whole: two requests for the encoder.
  const encoderRequests: string[] = [];
  context.on('request', (r) => r.url().endsWith(ENCODER) && encoderRequests.push(r.url()));
  await withActiveWorker(page);
  await transcribe(page);
  expect(encoderRequests.length).toBeGreaterThan(1);
  const sizes = await cachedSizes(page);
  expect(Object.keys(sizes).sort()).toEqual(['decoder_model_merged_quantized.onnx', ENCODER]);
  // The kept file is whole: the same size as the file served.
  expect(sizes[ENCODER]).toBe(statSync(fileURLToPath(new URL(`../public/models/whisper-base/onnx/${ENCODER}`, import.meta.url))).size);
});

for (const mode of ['truncated', 'garbage'] as const) {
  test(`a ${mode} kept model is dropped and downloaded again, and captions are written`, async ({ page, context }) => {
    test.setTimeout(240_000);
    await withActiveWorker(page);
    await transcribe(page);
    const good = await cachedSizes(page);
    await damageEncoder(page, mode);
    const requests: string[] = [];
    context.on('request', (r) => MODEL.test(r.url()) && requests.push(new URL(r.url()).pathname));
    await transcribe(page);
    expect(requests.some((p) => p.endsWith(ENCODER))).toBe(true);
    expect(await cachedSizes(page)).toEqual(good);
  });
}
