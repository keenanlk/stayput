// Minimal static server that mimics Vercel's cleanUrls for local testing.
// Usage: node scripts/serve.mjs [port]
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
    res.writeHead(status, { ...extraHeaders(url.pathname), 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end('error');
  }
}).listen(port, () => console.log(`Serving dist/ at http://localhost:${port}`));
