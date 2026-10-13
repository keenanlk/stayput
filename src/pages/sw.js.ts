import type { APIRoute } from 'astro';
import { tools } from '../data/tools';
import { pairs } from '../data/pairs';
import { presets } from '../data/presets';
import { guides } from '../data/guides';
import { vendorDir, type VendorLib } from '../lib/vendor';
import vendor from '../data/vendor.json';
import { FULL_PRECACHE_ON_FIRST_VISIT, TOP_PAGES } from '../data/precache';

/**
 * Service worker generated at build time so it knows every page. What it saves, and the
 * rollback switch, are in src/data/precache.ts.
 *
 * First visit: the app shell, the visited page with the scripts, workers and styles it can
 * load on demand (its "closure", computed by scripts/postbuild.mjs), and the short list of
 * top pages. Every page opened later is saved with its closure. An installed app saves
 * everything (the page sends 'save-all').
 *
 * Saved pages survive deploys. scripts/postbuild.mjs records a content hash per page; when a
 * new worker installs it compares each saved page with that hash and fetches only the ones
 * that changed. Pages are network-first with cache fallback (so deploys show up immediately,
 * and offline still works); hashed assets under /_astro/ and the versioned decoders under
 * /vendor/ are cache-first because their contents never change. The decoders are not
 * precached (see src/lib/vendor.ts): tool pages that may need one ask for it with a
 * 'cache-decoders' message.
 */
export const GET: APIRoute = () => {
  const pages = ['/', '/about', '/privacy', '/terms', ...tools.map((t) => `/tools/${t.slug}`), ...pairs.map((p) => `/${p.slug}`), ...presets.map((p) => `/${p.slug}`), '/guides', ...guides.map((g) => `/guides/${g.slug}`), '/search-index.json'];
  const unknownTop = TOP_PAGES.filter((p) => !pages.includes(p));
  if (unknownTop.length) throw new Error(`TOP_PAGES in src/data/precache.ts has pages that do not exist: ${unknownTop.join(', ')}`);
  const vendorDirs = (Object.keys(vendor) as VendorLib[]).map(vendorDir);
  const body = `
// Page cache with a stable name: it survives deploys (see the header of sw.js.ts).
const PAGE_CACHE = 'stayput-pages';
const ASSET_CACHE = 'stayput-assets';
const FULL_PRECACHE = ${JSON.stringify(FULL_PRECACHE_ON_FIRST_VISIT)};
const TOP_PAGES = ${JSON.stringify(TOP_PAGES)};
// Always saved with the shell: the registration script, the manifest and the icon.
const SHELL_FILES = ['/register-sw.js', '/manifest.webmanifest', '/favicon.svg'];
// Read, then removed, by scripts/postbuild.mjs (it hashes these pages' files in dist/).
const PAGE_PATHS = ${JSON.stringify(pages)};
// Filled by scripts/postbuild.mjs: { build, assets, shell, sets, pages }. assets lists the hashed
// scripts, styles and fonts; shell is the indexes every page needs; sets are the closures (indexes
// into assets); pages maps a path to [content hash, closure set].
const MANIFEST = __STAYPUT_MANIFEST__;
const ASSETS = MANIFEST.assets;
// Current decoder versions; cached copies of any other version are dropped on activate.
const VENDOR_DIRS = ${JSON.stringify(vendorDirs)};
const SAVED_MARK = '/__saved';

const abs = (p) => new URL(p, self.location.origin).href;
const pathOf = (u) => {
  const p = new URL(u, self.location.origin).pathname;
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
};
const closureOf = (path) => {
  const page = MANIFEST.pages[path];
  return page ? MANIFEST.sets[page[1]].map((i) => ASSETS[i]) : [];
};
const shellAssets = () => MANIFEST.shell.map((i) => ASSETS[i]);

async function hashOf(res) {
  const digest = await crypto.subtle.digest('SHA-256', await res.clone().arrayBuffer());
  return Array.from(new Uint8Array(digest).subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Adds the pages that are missing or changed since they were saved. Each saved page is compared
// with the content hash from the build, so a deploy refetches only the pages that changed.
async function ensurePages(paths) {
  const cache = await caches.open(PAGE_CACHE);
  const fetched = [];
  await Promise.allSettled(
    paths.map(async (path) => {
      const entry = MANIFEST.pages[path];
      if (!entry) return;
      const hit = await cache.match(abs(path));
      if (hit && (await hashOf(hit)) === entry[0]) return;
      const res = await fetch(abs(path), { credentials: 'same-origin' });
      if (!res.ok || res.redirected) throw new Error(path + ': HTTP ' + res.status);
      await cache.put(abs(path), res);
      fetched.push(path);
    }),
  );
  return fetched;
}

async function ensureAssets(urls) {
  const cache = await caches.open(ASSET_CACHE);
  const missing = [];
  for (const u of new Set(urls)) if (!(await cache.match(u))) missing.push(u);
  await Promise.allSettled(missing.map((u) => cache.add(u)));
  return missing.length;
}

async function ensureShellFiles() {
  const cache = await caches.open(PAGE_CACHE);
  await Promise.allSettled(SHELL_FILES.map(async (f) => (await cache.match(abs(f))) || cache.add(abs(f))));
}

// Pages the visitor has opened (as opposed to the top pages, which are saved without their scripts).
const VISITED = '/__visited';
let visitedQueue = Promise.resolve();
async function readVisited() {
  const hit = await (await caches.open(PAGE_CACHE)).match(VISITED);
  return hit ? await hit.json().catch(() => []) : [];
}
function markVisited(paths) {
  visitedQueue = visitedQueue
    .then(async () => {
      const list = await readVisited();
      const next = [...new Set([...list, ...paths])];
      if (next.length !== list.length) await (await caches.open(PAGE_CACHE)).put(VISITED, new Response(JSON.stringify(next)));
    })
    .catch(() => {});
  return visitedQueue;
}

async function cachedPaths() {
  const cache = await caches.open(PAGE_CACHE);
  return (await cache.keys()).map((r) => pathOf(r.url)).filter((p) => MANIFEST.pages[p]);
}

async function openPaths() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return clients.map((c) => pathOf(c.url)).filter((p) => MANIFEST.pages[p]);
}

async function everythingSaved() {
  return FULL_PRECACHE || !!(await (await caches.open(PAGE_CACHE)).match(SAVED_MARK));
}

// Everything: every page, script, style and font (the installed app, or FULL_PRECACHE).
async function saveAll() {
  await Promise.all([ensurePages(Object.keys(MANIFEST.pages)), ensureAssets(ASSETS), ensureShellFiles()]);
  await (await caches.open(PAGE_CACHE)).put(SAVED_MARK, new Response(MANIFEST.build));
}

async function install() {
  if (FULL_PRECACHE) return saveAll();
  // Pages saved earlier are brought up to date; the pages open right now and the top pages are added.
  const open = await openPaths();
  await markVisited(open);
  const fetched = await ensurePages([...new Set([...open, ...TOP_PAGES, ...(await cachedPaths())])]);
  // Scripts for visited pages that are new or changed; unchanged pages already have theirs.
  const visited = await readVisited();
  const refreshed = visited.filter((p) => fetched.includes(p));
  await Promise.all([ensureAssets([...shellAssets(), ...refreshed.flatMap(closureOf)]), ensureShellFiles()]);
  // An installed app (it saved everything earlier) stays complete.
  if (await everythingSaved()) await saveAll();
}

self.addEventListener('install', (event) => {
  event.waitUntil(install().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      (async () => {
        // Earlier versions kept pages in 'stayput-<version>-pages' and dropped them on every deploy.
        // Visitors start from the stable cache; the pages they open are saved again as they go.
        for (const k of await caches.keys()) if (k.endsWith('-pages') && k !== PAGE_CACHE) await caches.delete(k);
        // Pages the site no longer has.
        const pages = await caches.open(PAGE_CACHE);
        for (const req of await pages.keys()) {
          const p = pathOf(req.url);
          const known = MANIFEST.pages[p] || SHELL_FILES.includes(p) || p === SAVED_MARK || p === VISITED || p.startsWith('/icons/');
          if (!known) await pages.delete(req);
        }
      })(),
      // Drop hashed assets that no saved page needs any more, old decoder versions, and decoders
      // cached from the CDN the site used before it served them itself. Models are never replaced
      // in place, so they stay.
      (async () => {
        const keepAll = await everythingSaved();
        const visited = keepAll ? [] : (await readVisited()).filter((p) => MANIFEST.pages[p]);
        const keep = new Set((keepAll ? ASSETS : [...shellAssets(), ...visited.flatMap(closureOf)]).map(abs));
        const cache = await caches.open(ASSET_CACHE);
        for (const req of await cache.keys()) {
          const url = new URL(req.url);
          const current = url.origin === self.location.origin && (keep.has(url.href) || VENDOR_DIRS.some((d) => url.pathname.startsWith(d)) || url.pathname.startsWith('/models/'));
          if (!current) await cache.delete(req);
        }
      })(),
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
  if (!data) return;
  // The installed app asks for every page and script (see public/register-sw.js).
  if (data.type === 'save-all') {
    event.waitUntil(
      (async () => {
        const mark = await (await caches.open(PAGE_CACHE)).match(SAVED_MARK);
        if (!mark || (await mark.text()) !== MANIFEST.build) await saveAll();
      })().catch(() => {}),
    );
    return;
  }
  if (data.type !== 'cache-decoders' || !Array.isArray(data.urls)) return;
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

// The speech model files belong to transformers.js, which stores them itself.
const isOwnedElsewhere = (url) => url.pathname.startsWith('/models/whisper-base/');
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

async function afterVisit(path) {
  if (!MANIFEST.pages[path]) return;
  await markVisited([path]);
  if (FULL_PRECACHE) return;
  await new Promise((r) => setTimeout(r, 1500));
  await ensureAssets(closureOf(path));
}

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
      // The page's own scripts are fetched as it loads; its on-demand ones are saved a moment later.
      event.waitUntil(afterVisit(pathOf(req.url)));
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
