// node --test worker/handler.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, parseRange } from './handler.mjs';

const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
const sha256 = 'a'.repeat(64);
const entry = {
  key: `models/x.onnx@${sha256}`,
  size: bytes.length,
  sha256,
  contentType: 'application/octet-stream',
  headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Frame-Options': 'DENY' },
};
const handler = createHandler({ '/models/x.onnx': entry });
const url = 'https://stayput.dev/models/x.onnx';

/** An R2 bucket holding the file, counting reads, and a cache that keeps whole files and cuts ranges as Cloudflare's does. */
function world({ empty = false } = {}) {
  const store = new Map();
  const counts = { get: 0, head: 0 };
  const bucket = {
    async get(key, opts) {
      counts.get++;
      if (empty || key !== entry.key) return null;
      const { offset = 0, length = bytes.length } = opts?.range ?? {};
      return { body: new Blob([bytes.slice(offset, offset + length)]).stream() };
    },
    async head(key) {
      counts.head++;
      return empty || key !== entry.key ? null : { size: bytes.length };
    },
  };
  globalThis.caches = {
    default: {
      async match(req) {
        const held = store.get(typeof req === 'string' ? req : req.url);
        if (!held) return undefined;
        const r = parseRange(req.headers?.get('Range'), held.body.length);
        if (!r) return new Response(held.body, { headers: { ...held.headers, 'Content-Length': String(held.body.length) } });
        return new Response(held.body.slice(r.offset, r.offset + r.length), {
          status: 206,
          headers: { ...held.headers, 'Content-Length': String(r.length), 'Content-Range': `bytes ${r.offset}-${r.offset + r.length - 1}/${held.body.length}` },
        });
      },
      async put(key, res) {
        store.set(key, { body: new Uint8Array(await res.arrayBuffer()), headers: Object.fromEntries(res.headers) });
      },
    },
  };
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const send = (path, init) => handler.fetch(new Request(path, init), { ASSETS_BUCKET: bucket }, ctx);
  return { send, counts, store, settle: () => Promise.all(waits) };
}

const body = async (res) => new Uint8Array(await res.arrayBuffer());

test('parseRange covers the forms a browser sends', () => {
  assert.equal(parseRange(null, 100), null);
  assert.deepEqual(parseRange('bytes=0-9', 100), { offset: 0, length: 10 });
  assert.deepEqual(parseRange('bytes=90-', 100), { offset: 90, length: 10 });
  assert.deepEqual(parseRange('bytes=-10', 100), { offset: 90, length: 10 });
  assert.deepEqual(parseRange('bytes=-1000', 100), { offset: 0, length: 100 });
  assert.deepEqual(parseRange('bytes=95-1000', 100), { offset: 95, length: 5 });
  assert.equal(parseRange('bytes=100-', 100), 'unsatisfiable');
  assert.equal(parseRange('bytes=-0', 100), 'unsatisfiable');
  assert.equal(parseRange('bytes=0-1,5-6', 100), null);
  assert.equal(parseRange('bytes=9-1', 100), null);
  assert.equal(parseRange('items=0-1', 100), null);
});

test('GET returns the whole file with its headers', async () => {
  const { send } = world();
  const res = await send(url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), entry.headers['Cache-Control']);
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(res.headers.get('ETag'), `"${sha256}"`);
  assert.equal(res.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(res.headers.get('Content-Encoding'), null);
  assert.deepEqual(await body(res), bytes);
});

test('Range returns 206 with the right bytes and Content-Range', async () => {
  const { send } = world();
  const res = await send(url, { headers: { Range: 'bytes=10-19' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('Content-Range'), 'bytes 10-19/100');
  assert.equal(res.headers.get('Content-Encoding'), null);
  assert.deepEqual(await body(res), bytes.slice(10, 20));
});

test('a range past the end is 416 with the size', async () => {
  const { send } = world();
  const res = await send(url, { headers: { Range: 'bytes=100-' } });
  assert.equal(res.status, 416);
  assert.equal(res.headers.get('Content-Range'), 'bytes */100');
});

test('HEAD gives the headers and no body, and a ranged HEAD says what a GET would send', async () => {
  const { send } = world();
  const whole = await send(url, { method: 'HEAD' });
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('Content-Length'), '100');
  assert.equal((await body(whole)).length, 0);
  const part = await send(url, { method: 'HEAD', headers: { Range: 'bytes=0-9' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('Content-Range'), 'bytes 0-9/100');
});

test('a repeat read comes from the cache, whole or ranged, with no second R2 read', async () => {
  const { send, counts, settle } = world();
  assert.equal((await send(url)).headers.get('X-Stayput-Source'), 'r2');
  await settle();
  const reads = counts.get;
  const whole = await send(url);
  assert.equal(whole.headers.get('X-Stayput-Source'), 'cache');
  assert.deepEqual(await body(whole), bytes);
  const part = await send(url, { headers: { Range: 'bytes=10-19' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('Content-Range'), 'bytes 10-19/100');
  assert.equal(part.headers.get('X-Frame-Options'), 'DENY');
  assert.deepEqual(await body(part), bytes.slice(10, 20));
  assert.equal(counts.get, reads);
});

test('a ranged miss also fills the cache with the whole file, never with the part', async () => {
  const { send, store, settle } = world();
  await send(url, { headers: { Range: 'bytes=10-19' } });
  await settle();
  assert.equal([...store.values()][0].body.length, bytes.length);
});

test('the cache key changes with the hash, so a replaced file is not served from the old entry', async () => {
  const { send, store, settle } = world();
  await send(url);
  await settle();
  assert.ok([...store.keys()][0].includes(`sha256=${sha256}`));
});

test('a failing cache read still serves the file from R2', async () => {
  const { send } = world();
  const original = console.error;
  console.error = () => {};
  caches.default.match = async () => {
    throw new Error('cache down');
  };
  try {
    const res = await send(url, { headers: { Range: 'bytes=10-19' } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('X-Stayput-Source'), 'r2');
    assert.deepEqual(await body(res), bytes.slice(10, 20));
  } finally {
    console.error = original;
  }
});

test('If-None-Match with the ETag is 304; If-Range with another ETag gets the whole file', async () => {
  const { send } = world();
  assert.equal((await send(url, { headers: { 'If-None-Match': `"${sha256}"` } })).status, 304);
  assert.equal((await send(url, { headers: { Range: 'bytes=0-9', 'If-Range': `"${sha256}"` } })).status, 206);
  assert.equal((await send(url, { headers: { Range: 'bytes=0-9', 'If-Range': '"other"' } })).status, 200);
});

test('anything else is 404, and other methods are 405', async () => {
  const { send, counts } = world();
  assert.equal((await send('https://stayput.dev/models/other.onnx')).status, 404);
  assert.equal((await send('https://stayput.dev/constructor')).status, 404);
  assert.equal(counts.get, 0);
  const post = await send(url, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD');
});

test('a listed file missing from R2 is 404, not a broken 200', async () => {
  const { send } = world({ empty: true });
  assert.equal((await send(url)).status, 404);
  assert.equal((await send(url, { method: 'HEAD' })).status, 404);
});
