// Serves the files too big for Workers static assets (25 MiB) from R2, at the URLs they
// have always had. `wrangler.jsonc` routes only those paths here; everything else is a
// static asset and never reaches this code.
//
// `manifest` is dist/.cloudflare/oversize.json, written by scripts/cloudflare-assets.mjs:
//   { "/models/x.onnx": { key, size, sha256, contentType, headers } }
// `headers` already holds the Cache-Control and security headers vercel.json gives that path,
// because Cloudflare's _headers file does not apply to a Worker's responses.
//
// R2 keys carry the SHA-256, so an object never changes once written. That is what makes the
// year-long cache safe: replacing a model gives it a new key and a new cache entry, and a
// rolled-back Worker still finds the bytes it expects.

const BYTES_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * What a Range header asks of a file of `size` bytes: null for "send the whole file" (no header, a
 * form we do not serve such as several ranges), 'unsatisfiable' for a range outside the file, or the
 * { offset, length } to send.
 */
export function parseRange(header, size) {
  const m = header ? BYTES_RANGE.exec(header.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Number(m[2]);
  if (m[2] !== '' && end < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

const etagOf = (entry) => `"${entry.sha256}"`;

/** Whether an If-None-Match or If-Range value names this file. Weak forms count: the bytes are content-addressed. */
const etagMatches = (value, etag) =>
  value
    .split(',')
    .map((v) => v.trim().replace(/^W\//, ''))
    .some((v) => v === etag || v === '*');

/** The headers every response for this file carries. */
function fileHeaders(entry) {
  return new Headers({
    ...entry.headers,
    'Content-Type': entry.contentType,
    ETag: etagOf(entry),
    'Accept-Ranges': 'bytes',
  });
}

/** One cache entry per file version, so a replaced file can never be answered from the old one. */
function cacheKey(request, entry) {
  const url = new URL(request.url);
  url.search = `?sha256=${entry.sha256}`;
  return url.toString();
}

/** Copy the whole file from R2 into the cache after the response has gone out. A failure here only costs the next reader a trip to R2. */
async function fillCache(cache, key, entry, env) {
  const object = await env.ASSETS_BUCKET.get(entry.key);
  if (!object) return;
  const headers = fileHeaders(entry);
  headers.set('Content-Length', String(entry.size));
  await cache.put(key, new Response(object.body, { headers }));
}

export function createHandler(manifest) {
  const plain = (status, body, extra = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...extra } });

  return {
    async fetch(request, env, ctx) {
      const { pathname } = new URL(request.url);
      const entry = Object.hasOwn(manifest, pathname) ? manifest[pathname] : undefined;
      if (!entry) return plain(404, 'Not found\n');
      const baseHeaders = fileHeaders(entry);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        baseHeaders.set('Allow', 'GET, HEAD');
        return new Response(null, { status: 405, headers: baseHeaders });
      }

      const etag = etagOf(entry);
      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) return new Response(null, { status: 304, headers: baseHeaders });

      // If-Range: resume only if the client's partial copy is this file; otherwise it needs all of it.
      const ifRange = request.headers.get('If-Range');
      const rangeHeader = ifRange && !etagMatches(ifRange, etag) ? null : request.headers.get('Range');
      const range = parseRange(rangeHeader, entry.size);
      if (range === 'unsatisfiable') {
        baseHeaders.set('Content-Range', `bytes */${entry.size}`);
        return new Response(null, { status: 416, headers: baseHeaders });
      }

      if (request.method === 'HEAD') {
        const object = await env.ASSETS_BUCKET.head(entry.key);
        if (!object) return plain(404, 'Not found\n');
        baseHeaders.set('Content-Length', String(range ? range.length : entry.size));
        if (range) baseHeaders.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${entry.size}`);
        return new Response(null, { status: range ? 206 : 200, headers: baseHeaders });
      }

      const cache = caches.default;
      const key = cacheKey(request, entry);
      // The cache cuts the range itself out of the whole file it holds.
      // The cache is only a saving: if it fails, the file is still in R2.
      const hit = await cache.match(new Request(key, range ? { headers: { Range: rangeHeader } } : undefined)).catch((err) => {
        console.error(`cache read failed for ${entry.key}: ${err}`);
      });
      if (hit) {
        // Status, length and Content-Range come from the cache; the policy headers are this deploy's,
        // so a changed CSP reaches a file that was cached a year ago.
        const headers = new Headers(baseHeaders);
        for (const name of ['Content-Length', 'Content-Range']) {
          const value = hit.headers.get(name);
          if (value) headers.set(name, value);
        }
        headers.set('X-Stayput-Source', 'cache');
        return new Response(hit.body, { status: hit.status, headers });
      }

      const object = await env.ASSETS_BUCKET.get(entry.key, range ? { range } : undefined);
      if (!object) {
        console.error(`R2 object missing: ${entry.key}`);
        return plain(404, 'Not found\n');
      }
      // A second read, not a tee of this body: a tee would hold what a slow client has not taken yet in
      // the Worker's memory, and these files run close to its 128 MB limit.
      ctx.waitUntil(fillCache(cache, key, entry, env).catch((err) => console.error(`cache fill failed for ${entry.key}: ${err}`)));
      baseHeaders.set('X-Stayput-Source', 'r2');
      if (!range) return new Response(object.body, { status: 200, headers: baseHeaders });
      baseHeaders.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${entry.size}`);
      return new Response(object.body, { status: 206, headers: baseHeaders });
    },
  };
}
