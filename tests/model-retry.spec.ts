import { test, expect } from '@playwright/test';
import { LOAD_BACKOFF_MS, loadWithRetry } from '../src/lib/retry';

const network = () => new TypeError('Failed to fetch');

test('the model download is attempted three times, with 1 s and 3 s waits, then fails', async () => {
  expect(LOAD_BACKOFF_MS).toEqual([1000, 3000]);
  let calls = 0;
  await expect(
    loadWithRetry(async () => {
      calls++;
      throw network();
    }, () => true, [1, 1]),
  ).rejects.toThrow('Failed to fetch');
  expect(calls).toBe(3);
});

test('a download that works on the third attempt succeeds', async () => {
  let calls = 0;
  const v = await loadWithRetry(async () => (++calls < 3 ? Promise.reject(network()) : 'ok'), () => true, [1, 1]);
  expect(v).toBe('ok');
  expect(calls).toBe(3);
});

test('an error that is not a dropped connection is not retried', async () => {
  let calls = 0;
  await expect(loadWithRetry(async () => { calls++; throw new Error('bad model'); }, () => false, [1, 1])).rejects.toThrow('bad model');
  expect(calls).toBe(1);
});
