import { expect, test } from '@playwright/test';
import { RUN_STALL_MS, StalledError, watchEncode, watchProgress } from '../src/lib/encoder-watchdog';

/** The shell's no-progress watch for every picture and PDF tool (watchEncode's generalisation). */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const never = () => new Promise<never>(() => {});

test('the real limit is three minutes', () => {
  expect(RUN_STALL_MS).toBe(180_000);
});

test('silence fails with StalledError and cancels the work', async () => {
  let cancels = 0;
  const failure = await watchProgress(
    (tick) => {
      tick('a');
      return never();
    },
    () => void cancels++,
    { stallMs: 100, startMs: 100 },
  ).then(
    () => undefined,
    (e) => e,
  );
  expect(failure).toBeInstanceOf(StalledError);
  expect(failure.name).toBe('StalledError');
  expect(cancels).toBe(1);
});

test('a job that never reports anything stalls after the start limit', async () => {
  const failure = await watchProgress(never, () => undefined, { stallMs: 5_000, startMs: 100 }).catch((e) => e);
  expect(failure.name).toBe('StalledError');
});

test('progress that keeps changing is never cut short', async () => {
  const out = await watchProgress(
    async (tick) => {
      for (let i = 0; i < 8; i++) {
        tick(i);
        await sleep(40);
      }
      return 'done';
    },
    () => undefined,
    { stallMs: 120, startMs: 120 },
  );
  expect(out).toBe('done');
});

test('repeating the same value is not progress', async () => {
  const failure = await watchProgress(
    async (tick) => {
      for (;;) {
        tick('same');
        await sleep(30);
      }
    },
    () => undefined,
    { stallMs: 150, startMs: 150 },
  ).catch((e) => e);
  expect(failure.name).toBe('StalledError');
});

test('the job wins when it finishes first, and a failure of the job is its own', async () => {
  expect(await watchProgress(async () => 7, () => undefined, { stallMs: 50, startMs: 50 })).toBe(7);
  await expect(watchProgress(async () => Promise.reject(new RangeError('boom')), () => undefined, { stallMs: 50, startMs: 50 })).rejects.toThrow('boom');
  // No timer is left behind to fire later.
  await sleep(120);
});

test('it never fires while the page is hidden, and fires once it is shown again', async () => {
  const g = globalThis as unknown as { document?: { hidden: boolean } };
  const before = g.document;
  g.document = { hidden: true };
  try {
    let settled = false;
    const run = watchProgress(never, () => undefined, { stallMs: 60, startMs: 60 }).then(
      () => (settled = true),
      () => (settled = true),
    );
    await sleep(250);
    expect(settled).toBe(false);
    g.document.hidden = false;
    await run;
    expect(settled).toBe(true);
  } finally {
    g.document = before;
  }
});

test('watchEncode still fails with its own error', async () => {
  const failure = await watchEncode(never, () => undefined, { stallMs: 60, startMs: 60 }).catch((e) => e);
  expect(failure.name).toBe('EncoderStall');
});
