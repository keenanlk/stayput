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
