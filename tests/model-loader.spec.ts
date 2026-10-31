import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { downloadVerified, modelPreflight, persistAfterRun, sha256Hex } from '../src/lib/model-fetch';
import { retryUrl } from '../src/lib/fresh-url';

const root = fileURLToPath(new URL('../public/models/', import.meta.url));
const manifest: Record<string, { size: number; sha256: string }> = JSON.parse(readFileSync(fileURLToPath(new URL('../src/data/model-manifest.json', import.meta.url)), 'utf8'));

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* files(dir + e.name + '/');
    else if (e.name !== 'README.md') yield dir + e.name;
  }
}

test('the manifest lists every model file with the size and SHA-256 of the file on disk', () => {
  const onDisk = [...files(root)].map((f) => '/models/' + f.slice(root.length)).sort();
  expect(Object.keys(manifest).sort()).toEqual(onDisk);
  for (const [path, { size, sha256 }] of Object.entries(manifest)) {
    expect(statSync(root + path.slice('/models/'.length)).size, path).toBe(size);
    expect(createHash('sha256').update(readFileSync(root + path.slice('/models/'.length))).digest('hex'), path).toBe(sha256);
  }
});

const FILE = new Uint8Array(1000).map((_, i) => (i * 7) % 251);
const ENTRY = { size: FILE.length, sha256: createHash('sha256').update(FILE).digest('hex') };

/** A fake host: honours Range, and kills the first responses after the given share of the file; `bodies` swaps what a response carries. */
function host({ cuts = [] as (number | null)[], ranges = true, bodies = [] as (Uint8Array | null)[] } = {}) {
  const seen: (string | null)[] = [];
  const doFetch = async (_: unknown, init?: RequestInit): Promise<Response> => {
    const range = new Headers(init?.headers).get('Range');
    seen.push(range);
    const file = bodies.length ? (bodies.shift() ?? FILE) : FILE;
    const start = ranges && range ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
    const share = cuts.length ? cuts.shift()! : null;
    const end = share === null ? file.length : Math.floor(file.length * share);
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (!sent) {
          sent = true;
          if (end > start) return c.enqueue(file.slice(start, end));
        }
        if (end >= file.length) c.close();
        else c.error(new TypeError('network error'));
      },
    });
    const partial = ranges && range !== null;
    const headers: Record<string, string> = { 'content-length': String(file.length - start) };
    if (partial) headers['content-range'] = `bytes ${start}-${file.length - 1}/${file.length}`;
    return new Response(body, { status: partial ? 206 : 200, headers });
  };
  return { doFetch, seen };
}
const opts = { what: 'test model', entry: ENTRY, waits: [0, 0, 0] };

test('a download cut at 10% and again at 50% resumes with Range requests and passes the SHA-256 check', async () => {
  const h = host({ cuts: [0.1, 0.5, null] });
  const res = await downloadVerified(h.doFetch, '/m.onnx', opts);
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(FILE);
  expect(h.seen).toEqual([null, 'bytes=100-', 'bytes=500-']);
});

test('a host that answers a resume with 200 sends the file again and the run still gets the right bytes', async () => {
  const h = host({ cuts: [0.5, null], ranges: false });
  const res = await downloadVerified(h.doFetch, '/m.onnx', opts);
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(FILE);
});

test('a download whose resumes all fail is ModelDownloadError', async () => {
  const h = host({ cuts: [0.1, 0.1, 0.1, 0.1] });
  await expect(downloadVerified(h.doFetch, '/m.onnx', opts)).rejects.toMatchObject({ name: 'ModelDownloadError' });
});

test('a body of the right size with the wrong bytes is downloaded once more, then refused as ModelCorrupted', async () => {
  const flipped = FILE.map((b, i) => (i % 10 === 0 ? ~b & 0xff : b));
  const once = host({ bodies: [flipped, null] });
  const ok = await downloadVerified(once.doFetch, '/m.onnx', opts);
  expect(new Uint8Array(await ok.arrayBuffer())).toEqual(FILE);
  expect(once.seen).toHaveLength(2);
  const twice = host({ bodies: [flipped, flipped, flipped] });
  await expect(downloadVerified(twice.doFetch, '/m.onnx', opts)).rejects.toMatchObject({ name: 'ModelCorrupted' });
  expect(twice.seen).toHaveLength(2);
});

test('a body of the wrong size is refused the same way', async () => {
  const h = host({ bodies: [FILE.slice(0, 900), FILE.slice(0, 900)] });
  await expect(downloadVerified(h.doFetch, '/m.onnx', opts)).rejects.toMatchObject({ name: 'ModelCorrupted' });
});

test('a response that is not ok is handed back as it came', async () => {
  const res = await downloadVerified(async () => new Response('no', { status: 404 }), '/m.onnx', opts);
  expect(res.status).toBe(404);
});

function pretend(env: { onLine?: boolean; quota?: number; usage?: number; persist?: () => Promise<boolean>; persisted?: boolean; caches?: string[] }) {
  const calls = { persist: 0 };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      onLine: env.onLine ?? true,
      storage: {
        estimate: async () => ({ quota: env.quota, usage: env.usage }),
        persist: async () => (calls.persist++, true),
        persisted: async () => env.persisted ?? false,
      },
    },
  });
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { has: async (n: string) => (env.caches ?? []).includes(n) } });
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
  return calls;
}

test('offline is ModelOffline at once, and too little free storage is StorageFull', async () => {
  pretend({ onLine: false });
  await expect(modelPreflight(1e6, 'test model')).rejects.toMatchObject({ name: 'ModelOffline' });
  // A browser that says it is online while a request for a small file of ours fails is offline too.
  pretend({ onLine: true });
  await expect(modelPreflight(1e6, 'test model', async () => false)).rejects.toMatchObject({ name: 'ModelOffline' });
  pretend({ quota: 50e6, usage: 10e6 });
  await expect(modelPreflight(53e6, 'test model')).rejects.toMatchObject({ name: 'StorageFull' });
  await expect(modelPreflight(30e6, 'test model')).resolves.toBeUndefined();
  // A browser that does not say how much room there is gets the benefit of the doubt.
  pretend({});
  await expect(modelPreflight(53e6, 'test model')).resolves.toBeUndefined();
});

test('persist() is asked once, only after a model has been kept', async () => {
  const none = pretend({ caches: [] });
  await persistAfterRun();
  expect(none.persist).toBe(0);
  const calls = pretend({ caches: ['stayput-models-v1'] });
  await persistAfterRun();
  await persistAfterRun();
  expect(calls.persist).toBe(1);
});

test('a worker or script that is tried again is asked for from a new URL', () => {
  expect(retryUrl('/_astro/w.js', 0)).toBe('/_astro/w.js');
  expect(retryUrl('/_astro/w.js', 1)).toBe('/_astro/w.js?again=1');
  expect(retryUrl('/src/w.ts?worker_file&type=module', 2)).toBe('/src/w.ts?worker_file&type=module&again=2');
});

test('sha256Hex matches node', async () => {
  expect(await sha256Hex(FILE)).toBe(ENTRY.sha256);
});
