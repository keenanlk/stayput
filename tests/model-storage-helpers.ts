import { expect, type Page } from '@playwright/test';

/** What a network fault looks like to the loader: the fetch itself is wrapped, in the page or in a worker. */
export type Faults = {
  /** Part of the URL of the file to hurt. */
  match: string;
  /** Per response, in order: the share of the file (0 to 1, from its start) at which the body dies; null leaves that response whole. */
  cuts?: (number | null)[];
  /** Answer Range requests with 206 (default), or ignore them and send the whole file with 200. */
  ranges?: boolean;
};

/** Source of the fetch wrapper, run where the model is fetched (self.fetch). Serialised by toString, so it holds no closures. */
function wrapFetch(faults: Faults) {
  const real = self.fetch.bind(self);
  const cuts = [...(faults.cuts ?? [])];
  const honour = faults.ranges !== false;
  self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes(faults.match)) return real(input, init);
    const headers = new Headers(init?.headers);
    const range = headers.get('Range');
    headers.delete('Range');
    const full = new Uint8Array(await (await real(input, { ...init, headers })).arrayBuffer());
    const start = honour && range ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
    const share = cuts.length ? cuts.shift()! : null;
    const end = share === null ? full.length : Math.floor(full.length * share);
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (!sent) {
          sent = true;
          if (end > start) return c.enqueue(full.subarray(start, end));
        }
        if (end >= full.length) c.close();
        else c.error(new TypeError('network error'));
      },
    });
    const h: Record<string, string> = { 'content-type': 'application/octet-stream', 'content-length': String(full.length - start) };
    const partial = honour && range !== null;
    if (partial) h['content-range'] = `bytes ${start}-${full.length - 1}/${full.length}`;
    return new Response(body, { status: partial ? 206 : 200, headers: h });
  };
}

/** Break the fetch of one model file in the page itself (a loader that runs on the main thread). */
export async function faultInPage(page: Page, faults: Faults) {
  await page.addInitScript(`(${wrapFetch.toString()})(${JSON.stringify(faults)})`);
}

/**
 * Run `body(arg)` inside every worker before its own script starts. The worker is wrapped in a blob worker that
 * resolves "/models/..." against the page's origin, then imports the real script; messages sent before it is
 * ready are held and replayed.
 */
export async function patchWorkers<A>(page: Page, body: (arg: A) => void, arg?: A) {
  await page.addInitScript(
    ([code, argument]) => {
      const Real = window.Worker;
      (window as unknown as { Worker: unknown }).Worker = class extends Real {
        constructor(url: string | URL, options?: WorkerOptions) {
          const src = `const nativeFetch = self.fetch.bind(self);
self.fetch = (input, init) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? ${JSON.stringify(location.origin)} + input : input, init);
for (const method of ['put', 'match', 'delete']) {
  const native = Cache.prototype[method];
  Cache.prototype[method] = function (key, ...rest) {
    return native.call(this, typeof key === 'string' && key.startsWith('/') ? ${JSON.stringify(location.origin)} + key : key, ...rest);
  };
}
(${code})(${argument});
const held = [];
const hold = (e) => { e.stopImmediatePropagation(); held.push(e.data); };
self.addEventListener('message', hold, true);
await import(${JSON.stringify(new URL(String(url), location.href).href)});
self.removeEventListener('message', hold, true);
for (const data of held) self.dispatchEvent(new MessageEvent('message', { data }));`;
          super(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { ...options, type: 'module' });
        }
      };
    },
    [body.toString(), JSON.stringify(arg ?? null)] as [string, string],
  );
}

/** Fault the fetch of a model file inside the worker that loads it. */
export const faultInWorkers = (page: Page, faults: Faults) => patchWorkers(page, wrapFetch, faults);

/** Count the run the way the real analytics would, keeping the events in sessionStorage. */
export async function recordAnalytics(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

export type Ev = { n: string; d: Record<string, string> };
export const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
export async function toolRuns(page: Page, count: number) {
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length, { timeout: 30_000 }).toBe(count);
  return (await events(page)).filter((e) => e.n === 'tool_run').map((e) => e.d);
}

/** What a Cache API store holds: path -> size, plus the SHA-256 of each body. */
export async function kept(page: Page, cacheName: string): Promise<Record<string, { size: number; sha256: string }>> {
  return page.evaluate(async (name) => {
    const out: Record<string, { size: number; sha256: string }> = {};
    if (!(await caches.has(name))) return out;
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      const buf = await (await cache.match(req))!.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('');
      out[new URL(req.url).pathname] = { size: buf.byteLength, sha256: hash };
    }
    return out;
  }, cacheName);
}

/** Replace a kept file with bytes of the same length, every one flipped. */
export async function flipKept(page: Page, cacheName: string, pathEndsWith: string) {
  await page.evaluate(
    async ([name, ends]) => {
      const cache = await caches.open(name!);
      const req = (await cache.keys()).find((r) => r.url.endsWith(ends!))!;
      const bytes = new Uint8Array(await (await cache.match(req))!.arrayBuffer());
      for (let i = 0; i < bytes.length; i += 4096) bytes[i] = ~bytes[i]! & 0xff;
      await cache.put(req, new Response(bytes, { headers: { 'content-length': String(bytes.length), 'content-type': 'application/octet-stream' } }));
    },
    [cacheName, pathEndsWith],
  );
}

/** Spy on navigator.storage.persist in the page; the count is read back with persistCalls. */
export async function spyPersist(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __persist: number }).__persist = 0;
    if (navigator.storage) {
      navigator.storage.persist = () => ((window as unknown as { __persist: number }).__persist++, Promise.resolve(true));
      navigator.storage.persisted = () => Promise.resolve(false);
    }
  });
}
export const persistCalls = (page: Page) => page.evaluate(() => (window as unknown as { __persist: number }).__persist);
