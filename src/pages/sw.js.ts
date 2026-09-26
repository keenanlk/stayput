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
 * pages that need one put it in ASSET_CACHE themselves.
 */
export const GET: APIRoute = () => {
  const pages = ['/', '/about', '/privacy', ...tools.map((t) => `/tools/${t.slug}`), ...pairs.map((p) => `/${p.slug}`), ...presets.map((p) => `/${p.slug}`), '/guides', ...guides.map((g) => `/guides/${g.slug}`)];
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
    ]).then(() => self.clients.claim()),
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
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === 'navigate' || url.pathname === '/register-sw.js' || url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/icons/') || url.pathname === '/favicon.svg')) {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const home = await caches.match('/');
          if (home) return home;
        }
        return Response.error();
      }),
  );
});
`;
  return new Response(body.trimStart(), { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
};
