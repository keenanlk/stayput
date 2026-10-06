// Minimal static server that mimics Vercel's cleanUrls for local testing.
// Usage: node scripts/serve.mjs [port]
// With STAYPUT_PROD_CACHE=1 it also answers like production for caching: the Cache-Control
// from vercel.json is kept (immutable models and assets, revalidated pages), and byte
// ranges are served. STAYPUT_THROTTLE_MBPS=N also sends /models/ files at N megabytes a second,
// so a download is still in flight when the page asks for the same file again, as on a real
// connection (loopback finishes 54 MB before anything else can happen). By default every response is no-store so tests never see stale files.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
// Apply the response headers from vercel.json (the strict CSP among them) so the
// local server behaves like production and the tests catch CSP violations.
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const headerRules = (vercel.headers ?? []).map((h) => ({ re: new RegExp('^' + h.source.replace(/\(\.\*\)/g, '.*') + '$'), headers: h.headers }));
function extraHeaders(pathname) {
  const out = {};
  for (const rule of headerRules) if (rule.re.test(pathname)) for (const h of rule.headers) out[h.key] = h.value;
  return out;
}
const throttle = Number(process.env.STAYPUT_THROTTLE_MBPS ?? 0) * 1e6;
const prodCache = process.env.STAYPUT_PROD_CACHE === '1';
const port = Number(process.argv[2] ?? process.env.PORT ?? 4321);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webm': 'video/webm', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2',
};

async function exists(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** Write the body, a tenth of a second's worth at a time for throttled paths. */
function send(res, body, pathname) {
  if (!throttle || !pathname.startsWith('/models/')) return res.end(body);
  const step = Math.max(1, Math.floor(throttle / 10));
  let at = 0;
  const timer = setInterval(() => {
    if (res.destroyed) return clearInterval(timer);
    res.write(body.subarray(at, at + step));
    at += step;
    if (at >= body.length) {
      clearInterval(timer);
      res.end();
    }
  }, 100);
  res.on('close', () => clearInterval(timer));
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  let file = join(root, path);
  if (!(await exists(file)) && (await exists(file + '.html'))) file += '.html';
  let status = 200;
  if (!(await exists(file))) {
    file = join(root, '404.html');
    status = 404;
  }
  try {
    const body = await readFile(file);
    const headers = { ...extraHeaders(url.pathname), 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
    if (!prodCache) {
      res.writeHead(status, { ...headers, 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    headers['Cache-Control'] ??= 'public, max-age=0, must-revalidate';
    headers['Accept-Ranges'] = 'bytes';
    const range = status === 200 && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      if (start > end || start >= body.length) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${body.length}` });
        return res.end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 });
      return send(res, body.subarray(start, end + 1), url.pathname);
    }
    res.writeHead(status, { ...headers, 'Content-Length': body.length });
    send(res, body, url.pathname);
  } catch {
    res.writeHead(500);
    res.end('error');
  }
}).listen(port, () => console.log(`Serving dist/ at http://localhost:${port}`));
