import type { APIRoute } from 'astro';
import { tools } from '../data/tools';
import { pairs } from '../data/pairs';
import { presets } from '../data/presets';
import { guides } from '../data/guides';
import { vendorDir, type VendorLib } from '../lib/vendor';
import vendor from '../data/vendor.json';

/**
 * Service worker generated at build time so it knows every tool page.
 * Strategy: pages are network-first with cache fallback (so deploys show up
 * immediately, and offline still works); hashed assets under /_astro/ and the
 * versioned decoders under /vendor/ are cache-first because their contents
 * never change. The decoders are not precached (see src/lib/vendor.ts): tool
 * pages that may need one ask for it with a 'cache-decoders' message.
 */
export const GET: APIRoute = () => {
  const pages = ['/', '/about', '/privacy', '/terms', ...tools.map((t) => `/tools/${t.slug}`), ...pairs.map((p) => `/${p.slug}`), ...presets.map((p) => `/${p.slug}`), '/guides', ...guides.map((g) => `/guides/${g.slug}`), '/search-index.json'];
  const version = `stayput-${Date.now().toString(36)}`;
  const vendorDirs = (Object.keys(vendor) as VendorLib[]).map(vendorDir);
  const body = `
const VERSION = ${JSON.stringify(version)};
const PAGE_CACHE = VERSION + '-pages';
const ASSET_CACHE = 'stayput-assets';
const PAGES = ${JSON.stringify(pages)};
// Hashed scripts, styles and fonts; scripts/postbuild.mjs fills the list from dist/ so a tool
// works offline even if its on-demand chunks (pdf-lib, pdf.js, the worker) were never fetched.
const ASSETS = __STAYPUT_ASSETS__;
// Current decoder versions; cached copies of any other version are dropped on activate.
const VENDOR_DIRS = ${JSON.stringify(vendorDirs)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(PAGE_CACHE).then((cache) => Promise.allSettled(PAGES.map((p) => cache.add(p)))),
      caches.open(ASSET_CACHE).then(async (cache) => {
        const missing = [];
        for (const a of ASSETS) if (!(await cache.match(a))) missing.push(a);
        await Promise.allSettled(missing.map((a) => cache.add(a)));
      }),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k.endsWith('-pages') && k !== PAGE_CACHE).map((k) => caches.delete(k)))),
      // Drop hashed assets from earlier deploys, old decoder versions, and decoders
      // cached from the CDN the site used before it served them itself.
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

const isImmutable = (url) =>
  url.origin === self.location.origin && (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/vendor/'));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isImmutable(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
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
