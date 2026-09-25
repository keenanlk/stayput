import type { APIRoute } from 'astro';
import { tools } from '../data/tools';
import { pairs } from '../data/pairs';

/**
 * Service worker generated at build time so it knows every tool page.
 * Strategy: pages are network-first with cache fallback (so deploys show up
 * immediately, and offline still works); hashed assets under /_astro/ and the
 * HEIC decoder on jsDelivr are cache-first because their contents never change.
 */
export const GET: APIRoute = () => {
  const pages = ['/', '/about', '/privacy', ...tools.map((t) => `/tools/${t.slug}`), ...pairs.map((p) => `/${p.slug}`)];
  const version = `stayput-${Date.now().toString(36)}`;
  const body = `
const VERSION = ${JSON.stringify(version)};
const PAGE_CACHE = VERSION + '-pages';
const ASSET_CACHE = 'stayput-assets';
const PAGES = ${JSON.stringify(pages)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => Promise.allSettled(PAGES.map((p) => cache.add(p)))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.endsWith('-pages') && k !== PAGE_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const isImmutable = (url) =>
  (url.origin === self.location.origin && url.pathname.startsWith('/_astro/')) ||
  (url.hostname === 'cdn.jsdelivr.net');

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
