import type { APIRoute } from 'astro';
import { vendorDir, type VendorLib } from '../lib/vendor';
import vendor from '../data/vendor.json';

/**
 * Service worker generated at build time.
 * Install fetches only the home page (the offline fallback) and what it needs. Every other page is
 * stored when it is visited, together with the scripts, styles, workers, wasm and fonts that page can
 * reach (scripts/postbuild.mjs writes that graph into this file), so a visited tool works offline
 * without the browser downloading the whole site. Pages are network-first with cache fallback (deploys
 * show up immediately); hashed assets under /_astro/ and the versioned decoders under /vendor/ are
 * cache-first because their contents never change. Both caches have fixed names, so a deploy
 * (which changes this file) does not empty them: only chunks that no longer exist are dropped. The
 * decoders are not precached (see src/lib/vendor.ts): tool pages that may need one ask for it with a
 * 'cache-decoders' message.
 */
export const GET: APIRoute = () => {
  const vendorDirs = (Object.keys(vendor) as VendorLib[]).map(vendorDir);
  const body = `
const VERSION = ${JSON.stringify(`stayput-${Date.now().toString(36)}`)};
const PAGE_CACHE = 'stayput-pages';
const ASSET_CACHE = 'stayput-assets';
// Hashed scripts, styles and fonts that exist in this build, and for each the indexes of the files
// it loads (static and dynamic imports, workers, wasm, fonts); scripts/postbuild.mjs fills both in.
const ASSETS = __STAYPUT_ASSETS__;
const DEPS = __STAYPUT_DEPS__;
// Landing pages (format pairs, presets) load one tool's code, named by data-base: the indexes of that tool's files.
const LANDING = __STAYPUT_LANDING__;
// Current decoder versions; cached copies of any other version are dropped on activate.
const VENDOR_DIRS = ${JSON.stringify(vendorDirs)};

// Pages that are not cached yet get cached when they are visited. Install only needs the fallback page.
self.addEventListener('install', (event) => {
  event.waitUntil(cachePage('/').catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      migratePageCaches(),
      // Drop hashed assets that no longer exist, old decoder versions, and decoders
      // cached from the CDN the site used before it served them itself. Files that are
      // still current stay, so a deploy does not download them again.
      caches.open(ASSET_CACHE).then(async (cache) => {
        const keep = new Set(ASSETS.map((a) => new URL(a, self.location.origin).href));
        for (const req of await cache.keys()) {
          const url = new URL(req.url);
          const current = url.origin === self.location.origin && (keep.has(url.href) || VENDOR_DIRS.some((d) => url.pathname.startsWith(d)));
          if (!current) await cache.delete(req);
        }
      }),
      // Let the browser fetch pages itself while the worker starts (see the fetch handler).
      self.registration.navigationPreload ? self.registration.navigationPreload.enable() : null,
    ]).then(() => self.clients.claim()),
  );
});

// Earlier workers named the page cache after the build (stayput-<build>-pages). Move what those held
// into the fixed-name cache once, then delete them.
async function migratePageCaches() {
  const old = (await caches.keys()).filter((k) => k !== PAGE_CACHE && /^stayput-.+-pages$/.test(k));
  if (!old.length) return;
  const cache = await caches.open(PAGE_CACHE);
  for (const name of old) {
    const from = await caches.open(name);
    for (const req of await from.keys()) {
      if (!(await cache.match(req))) {
        const res = await from.match(req);
        if (res) await cache.put(req, res);
      }
    }
    await caches.delete(name);
  }
}

// Stores a page and everything it can load. Only files that are not cached yet are fetched.
async function cachePage(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok || res.redirected) return;
  const cache = await caches.open(PAGE_CACHE);
  const html = await res.clone().text();
  await cache.put(path, res);
  await warm(html);
}

// Caches the /_astro/ files, fonts and workers a page's HTML points at, and everything those load in turn.
async function warm(html) {
  const index = new Map(ASSETS.map((a, i) => [a, i]));
  const todo = [];
  const seen = new Set();
  for (const m of html.matchAll(/\\/(?:_astro|fonts)\\/[\\w.-]+/g)) {
    const i = index.get(m[0]);
    if (i !== undefined && !seen.has(i)) (seen.add(i), todo.push(i));
  }
  const base = html.match(/data-base=\"([\\w-]+)\"/);
  for (const i of (base && LANDING[base[1]]) || []) if (!seen.has(i)) (seen.add(i), todo.push(i));
  for (let n = 0; n < todo.length; n++) for (const d of DEPS[todo[n]] || []) if (!seen.has(d)) (seen.add(d), todo.push(d));
  const cache = await caches.open(ASSET_CACHE);
  const missing = [];
  for (const i of todo) if (!(await cache.match(ASSETS[i]))) missing.push(ASSETS[i]);
  await Promise.allSettled(missing.map((a) => cache.add(a)));
}

// Tool pages ask for the decoders they may need (src/lib/vendor.ts). Downloading
// here rather than in the page lets it finish after the visitor navigates away,
// and each file is retried before the page is told it failed.
const inflight = new Map();
function cacheDecoder(cache, url) {
  if (!inflight.has(url)) {
    inflight.set(url, (async () => {
      if (await cache.match(url)) return;
      for (let attempt = 1; ; attempt++) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
          await cache.put(url, res);
          return;
        } catch (err) {
          if (attempt === 3) throw err;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    })().finally(() => inflight.delete(url)));
  }
  return inflight.get(url);
}

self.addEventListener('message', (event) => {
  const data = event.data;
  // A page opened before this worker controlled it was not stored by the fetch handler.
  if (data && data.type === 'cache-page' && typeof data.path === 'string' && /^\\/(?!\\/)/.test(data.path)) {
    event.waitUntil(cachePage(data.path).catch(() => {}));
    return;
  }
  if (!data || data.type !== 'cache-decoders' || !Array.isArray(data.urls)) return;
  const port = event.ports[0];
  const urls = data.urls
    .map((u) => new URL(u, self.location.origin))
    .filter((u) => u.origin === self.location.origin && VENDOR_DIRS.some((d) => u.pathname.startsWith(d)))
    .map((u) => u.pathname);
  event.waitUntil(
    caches
      .open(ASSET_CACHE)
      .then((cache) => Promise.all(urls.map((u) => cacheDecoder(cache, u))))
      .then(
        () => port && port.postMessage({ ok: true }),
        (err) => port && port.postMessage({ ok: false, error: String((err && err.message) || err) }),
      ),
  );
});

// These model files are downloaded, checked against the build-time manifest and kept by the page's own loader
// (src/lib/model-fetch.ts): the speech model by transformers.js through it, the person finders and the vocal
// remover's model in the 'stayput-models-v1' cache. A second, unchecked copy here would be a way for a damaged file to come back.
const OWNED_MODELS = ['/models/whisper-base/', '/models/whisper-tiny/', '/models/selfie_', '/models/blaze_face_', '/models/uvr-mdx-net-'];
const isOwnedElsewhere = (url) => OWNED_MODELS.some((p) => url.pathname.startsWith(p));
const isImmutable = (url) =>
  url.origin === self.location.origin && (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/models/'));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Not answered here at all, so the browser makes the one request itself.
  if (url.origin === self.location.origin && isOwnedElsewhere(url)) return;
  if (isImmutable(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        // A failed write only means no offline copy; the response still goes to the page.
        if (res.ok) event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
        return res;
      }),
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(navigate(event));
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (url.pathname === '/register-sw.js' || url.pathname === '/manifest.webmanifest' || url.pathname === '/search-index.json' || url.pathname.startsWith('/icons/') || url.pathname === '/favicon.svg')) {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || Response.error()),
  );
});

// Pages: network first, cache when offline. The page itself comes from the navigation
// preload request, which the browser makes the same way it would with no service worker.
// Re-fetching a navigation from inside the worker failed in Chrome for returning visitors
// (ERR_FAILED on the first open of a page, fine after a refresh). A network error never
// becomes an error page while a cached copy or a retry can still answer.
async function navigate(event) {
  const req = event.request;
  let res;
  try {
    res = await event.preloadResponse;
  } catch {}
  if (!res) {
    try {
      res = await fetch(req.url, { credentials: 'same-origin' });
    } catch {}
  }
  if (res) {
    if (res.ok && !res.redirected) {
      const copy = res.clone();
      caches.open(PAGE_CACHE).then((cache) => cache.put(req.url, copy)).catch(() => {});
      event.waitUntil(res.clone().text().then(warm).catch(() => {}));
    }
    // A redirected response cannot answer a navigation; let the browser follow the redirect.
    return res.redirected ? Response.redirect(res.url, 302) : res;
  }
  const hit = (await caches.match(req, { ignoreSearch: true })) || (await caches.match('/'));
  return hit || Response.error();
}
`;
  return new Response(body.trimStart(), { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
};
