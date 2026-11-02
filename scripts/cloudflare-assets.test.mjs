// node --test scripts/cloudflare-assets.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  contentTypeFor,
  convertHeaders,
  convertHeaderSource,
  convertRedirects,
  findOversize,
  headersForPath,
  parseHeaders,
  parseRedirects,
  r2Key,
  readWorkerFirst,
  renderHeaders,
  renderRedirects,
  verifyRules,
  writeWorkerFirst,
} from './cloudflare-assets.mjs';
import { needsUpload } from './cloudflare-r2-upload.mjs';

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const generated = () => [renderRedirects(convertRedirects(vercel.redirects)), renderHeaders(convertHeaders(vercel.headers))];

test('every vercel.json redirect but the Vercel hostname one survives, as a 308', () => {
  const [text] = generated();
  const parsed = parseRedirects(text);
  assert.equal(parsed.length, (vercel.redirects.length - 1) * 2);
  assert.deepEqual(parsed.find((r) => r.source === '/upscale-image/'), { source: '/upscale-image/', destination: '/tools/upscale-image', status: 308 });
  assert.ok(parsed.every((r) => r.status === 308));
  assert.ok(!text.includes('vercel.app'));
  assert.deepEqual(parsed.find((r) => r.source === '/tools'), { source: '/tools', destination: '/#tools', status: 308 });
});

test('every vercel.json header survives, with the full CSP', () => {
  const [, text] = generated();
  const parsed = parseHeaders(text);
  assert.equal(parsed.length, vercel.headers.length);
  const csp = parsed.find((r) => r.pattern === '/*').headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /media-src 'self' blob:/);
  verifyRules(vercel, ...generated());
});

test('a lost or altered rule fails the check', () => {
  const [redirects, headers] = generated();
  assert.throws(() => verifyRules(vercel, redirects.replace(/^\/tools .*\n/m, ''), headers), /Rule lost/);
  assert.throws(() => verifyRules(vercel, redirects.replace('/tools /#tools 308', '/tools /#tools 301'), headers), /Rule lost/);
  assert.throws(() => verifyRules(vercel, redirects, headers.replace("media-src 'self' blob:; ", '')), /Rule lost/);
  assert.throws(() => verifyRules(vercel, redirects, headers.replace(/^\/sw\.js\n.*\n/m, '')), /Rule lost/);
});

test('a redirect it cannot express stops the script instead of being dropped', () => {
  assert.throws(() => convertRedirects([{ source: '/a/:slug', destination: '/b/:slug', permanent: true }]), /cannot convert/);
  assert.throws(() => convertRedirects([{ source: '/a', has: [{ type: 'host', value: 'other.example' }], destination: '/b', permanent: true }]), /condition/);
  assert.throws(() => convertHeaderSource('/a/:slug/(.*)'), /cannot convert/);
});

test('a non-permanent redirect keeps Vercel status', () => {
  assert.equal(convertRedirects([{ source: '/a', destination: '/b', permanent: false }])[0].status, 307);
});

test('two rules setting one header are refused, since Cloudflare would join them', () => {
  const rule = (source, value) => ({ source, headers: [{ key: 'Cache-Control', value }] });
  assert.throws(() => convertHeaders([rule('/a/(.*)', 'x'), rule('/(.*)', 'y')]), /would join/);
  assert.doesNotThrow(() => convertHeaders([rule('/a/(.*)', 'x'), rule('/b/(.*)', 'y')]));
});

test('a model gets the immutable and security headers vercel.json gives it', () => {
  const h = headersForPath('/models/x.onnx', convertHeaders(vercel.headers));
  assert.equal(h['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.ok(h['Content-Security-Policy']);
});

test('content types match what Vercel serves', () => {
  assert.equal(contentTypeFor('/models/x.onnx'), 'application/octet-stream');
  assert.equal(contentTypeFor('/vendor/a@1.0.0/b.wasm'), 'application/wasm');
});

test('oversize detection reads dist, not a list of names', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cf-assets-'));
  try {
    await mkdir(join(dir, 'models/new'), { recursive: true });
    await writeFile(join(dir, 'small.bin'), Buffer.alloc(9));
    await writeFile(join(dir, 'models/new/big.onnx'), Buffer.alloc(10));
    const { files, oversize } = await findOversize(dir, 10);
    assert.equal(files, 2);
    assert.deepEqual(oversize.map((f) => f.path), ['/models/new/big.onnx']);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('run_worker_first is read and rewritten in the JSONC file', () => {
  const config = '{\n  "assets": {\n    // keep me\n    "run_worker_first": [\n      "/a",\n    ],\n  },\n}\n';
  assert.deepEqual(readWorkerFirst(config), ['/a']);
  const next = writeWorkerFirst(config, ['/b', '/c']);
  assert.deepEqual(readWorkerFirst(next), ['/b', '/c']);
  assert.match(next, /keep me/);
});

test('R2 keys differ when the bytes do, and upload is skipped only on a full match', () => {
  assert.equal(r2Key('/models/x.onnx', 'abc'), 'models/x.onnx@abc');
  const entry = { size: 5, sha256: 'abc' };
  assert.equal(needsUpload(entry, null), true);
  assert.equal(needsUpload(entry, { size: 4, sha256: 'abc' }), true);
  assert.equal(needsUpload(entry, { size: 5, sha256: 'abd' }), true);
  assert.equal(needsUpload(entry, { size: 5, sha256: 'abc' }), false);
});
