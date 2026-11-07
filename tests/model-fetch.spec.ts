import { test, expect } from '@playwright/test';
import { fetchResumable, wholeOrNull } from '../src/lib/model-fetch';

const FILE = new Uint8Array(1000).map((_, i) => i % 251);

/** A fake server: honours Range when `ranges`, and cuts the first `cuts.length` responses short after those many bytes. */
function server({ ranges = true, stated = true, cuts = [] as number[] } = {}) {
  const calls: (string | null)[] = [];
  const doFetch = async (_: unknown, init?: RequestInit): Promise<Response> => {
    const range = new Headers(init?.headers).get('Range');
    calls.push(range);
    const start = ranges && range ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
    const body = FILE.slice(start);
    const cut = cuts.shift();
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        // A cut response delivers its bytes, then fails on the next read.
        if (!sent) {
          sent = true;
          return c.enqueue(cut === undefined ? body : body.slice(0, cut));
        }
        if (cut === undefined) c.close();
        else c.error(new TypeError('network error'));
      },
    });
    const headers: Record<string, string> = {};
    if (stated || range) headers['content-length'] = String(body.length);
    const partial = ranges && range !== null;
    // A host answers a range with the decoded bytes and the full size, whatever the first response said.
    if (partial) headers['content-range'] = `bytes ${start}-${FILE.length - 1}/${FILE.length}`;
    else if (stated) headers['content-length'] = String(FILE.length);
    else headers['content-encoding'] = 'br';
    return new Response(stream, { status: partial ? 206 : 200, headers });
  };
  return { doFetch, calls };
}

test('a dropped download is resumed with a Range request and stitched together', async () => {
  const s = server({ cuts: [300, 400] });
  const res = await fetchResumable(s.doFetch, '/m.onnx', undefined, undefined, [0, 0, 0]);
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(FILE);
  expect(s.calls).toEqual([null, 'bytes=300-', 'bytes=700-']);
});

test('a compressed download that states no size is resumed too, and learns the size from the resumed response', async () => {
  const s = server({ stated: false, cuts: [300] });
  const res = await fetchResumable(s.doFetch, '/m.onnx', undefined, undefined, [0, 0]);
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(FILE);
  expect(s.calls).toEqual([null, 'bytes=300-']);
});

test('a server without Range support starts the file over', async () => {
  const s = server({ ranges: false, cuts: [300] });
  const seen: number[] = [];
  const res = await fetchResumable(s.doFetch, '/m.onnx', undefined, (got) => seen.push(got), [0, 0]);
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(FILE);
  expect(s.calls).toHaveLength(2);
  expect(seen.at(-1)).toBe(FILE.length);
});

test('a download that keeps dropping fails rather than returning a partial file', async () => {
  const s = server({ cuts: [100, 100, 100, 100] });
  const res = await fetchResumable(s.doFetch, '/m.onnx', undefined, undefined, [0, 0, 0]);
  await expect(res.arrayBuffer()).rejects.toThrow(/Failed to fetch/);
});

test('wholeOrNull rejects a body shorter than its content-length and keeps a whole one', async () => {
  const short = new Response(FILE.slice(0, 10), { headers: { 'content-length': String(FILE.length) } });
  expect(await wholeOrNull(short)).toBeNull();
  const whole = await wholeOrNull(new Response(FILE, { headers: { 'content-length': String(FILE.length) } }));
  expect(new Uint8Array(await whole!.arrayBuffer())).toEqual(FILE);
});

test('a download cut while the phone has no network waits for it and does not use up its tries', async () => {
  // Three cuts, but only two tries: each try is made after the network is back, so the wait is what carries it.
  const s = server({ cuts: [200, 200] });
  let waits = 0;
  const res = await fetchResumable(s.doFetch, '/m.onnx', undefined, undefined, [0, 0], async () => void waits++);
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(FILE);
  expect(waits).toBe(2);
  expect(s.calls).toEqual([null, 'bytes=200-', 'bytes=400-']);
});

test('waitForOnline resolves at once when online, on the online event when not, and at the limit otherwise', async () => {
  const { waitForOnline } = await import('../src/lib/model-fetch');
  const listeners = new Set<() => void>();
  const target = { addEventListener: (_: string, f: () => void) => void listeners.add(f), removeEventListener: (_: string, f: () => void) => void listeners.delete(f) };
  await waitForOnline(5000, { onLine: true }, target);
  expect(listeners.size).toBe(0);
  const pending = waitForOnline(5000, { onLine: false }, target);
  expect(listeners.size).toBe(1);
  [...listeners][0]!();
  await pending;
  expect(listeners.size).toBe(0);
  const started = Date.now();
  await waitForOnline(50, { onLine: false }, target);
  expect(Date.now() - started).toBeGreaterThanOrEqual(40);
  expect(listeners.size).toBe(0);
});

test('an abort during the offline wait ends the fetch at once, with no further tries', async () => {
  const s = server({ cuts: [200, 200, 200] });
  const ctl = new AbortController();
  let waiting = 0;
  // A network that never comes back; only the abort ends the wait.
  const online = (signal?: AbortSignal) => {
    waiting++;
    return new Promise<void>((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason)));
  };
  const res = await fetchResumable(s.doFetch, '/m.onnx', { signal: ctl.signal }, undefined, [0, 0, 0], online);
  const body = res.arrayBuffer();
  await expect.poll(() => waiting).toBe(1);
  const callsBefore = s.calls.length;
  const started = Date.now();
  ctl.abort();
  await expect(body).rejects.toBeDefined();
  expect(Date.now() - started).toBeLessThan(1000);
  expect(waiting).toBe(1);
  expect(s.calls.length).toBe(callsBefore);
});

test('waitForOnline ends at once on abort, and not at all when already aborted', async () => {
  const { waitForOnline } = await import('../src/lib/model-fetch');
  const listeners = new Set<() => void>();
  const target = { addEventListener: (_: string, f: () => void) => void listeners.add(f), removeEventListener: (_: string, f: () => void) => void listeners.delete(f) };
  const ctl = new AbortController();
  const pending = waitForOnline(60_000, { onLine: false }, target, ctl.signal);
  const rejected = expect(pending).rejects.toBeDefined();
  ctl.abort();
  await rejected;
  expect(listeners.size).toBe(0);
  await expect(waitForOnline(60_000, { onLine: false }, target, ctl.signal)).rejects.toBeDefined();
});

test('an ONNX Runtime import cut by a dropped connection is tried again once the network is back', async () => {
  const { importWhenOnline } = await import('../src/lib/model-fetch');
  let net = true;
  const imports: boolean[] = [];
  const doImport = async () => {
    imports.push(net);
    if (!net) throw new TypeError('Failed to fetch dynamically imported module');
  };
  // The device goes offline during the first import; the network returns while the wait is on.
  net = false;
  let waited = 0;
  await importWhenOnline('/vendor/x/ort.mjs', { label: { model: 'speech model' }, doImport, online: async () => void (waited++, (net = true)), isOffline: () => false });
  expect(imports).toEqual([false, true]);
  expect(waited).toBe(1);
});

test('an ONNX Runtime import that stays down ends as a named error after one more try', async () => {
  const { importWhenOnline } = await import('../src/lib/model-fetch');
  let tries = 0;
  const err = await importWhenOnline('/vendor/x/ort.mjs', {
    label: { model: 'speech model', size: '41 MB' },
    doImport: async () => (tries++, Promise.reject(new TypeError('Failed to fetch'))),
    online: async () => undefined,
    isOffline: () => false,
  }).then(() => new Error('resolved'), (e: Error) => e);
  expect(tries).toBe(2);
  expect(err.name).toBe('ModelDownloadError');
  expect(err.message).toContain('41 MB');
  // Still offline after the wait: ModelOffline.
  const off = await importWhenOnline('/vendor/x/ort.mjs', { label: { model: 'speech model' }, doImport: () => Promise.reject(new TypeError('x')), online: async () => undefined, isOffline: (() => { let n = 0; return () => n++ > 0; })() }).then(() => new Error('resolved'), (e: Error) => e);
  expect(off.name).toBe('ModelOffline');
});

test('an ONNX Runtime import with the device offline from the start fails at once as ModelOffline, without waiting', async () => {
  const { importWhenOnline } = await import('../src/lib/model-fetch');
  let waited = 0;
  const err = await importWhenOnline('/vendor/x/ort.mjs', { label: { model: 'speech model' }, doImport: () => Promise.reject(new TypeError('x')), online: async () => void waited++, isOffline: () => true }).then(() => new Error('resolved'), (e: Error) => e);
  expect(err.name).toBe('ModelOffline');
  expect(waited).toBe(0);
});

test('an abort during the wait for the ONNX Runtime import is not retried', async () => {
  const { importWhenOnline } = await import('../src/lib/model-fetch');
  const ctl = new AbortController();
  let tries = 0;
  const err = await importWhenOnline('/vendor/x/ort.mjs', {
    label: { model: 'speech model' },
    doImport: () => (tries++, Promise.reject(new TypeError('x'))),
    online: async (signal) => (ctl.abort(), Promise.reject(signal?.reason ?? new Error('aborted'))),
    signal: ctl.signal,
    isOffline: () => false,
  }).then(() => new Error('resolved'), (e: Error) => e);
  expect(tries).toBe(1);
  expect(err.name).toBe('AbortError');
});
