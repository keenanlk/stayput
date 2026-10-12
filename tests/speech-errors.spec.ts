import { test, expect } from '@playwright/test';
import { looksLikeMemory, plainCaptionError, phoneSpeechMemoryError } from '../src/lib/speech-errors';

test('a RangeError counts as memory only when its message says so', () => {
  const alloc = new RangeError('Array buffer allocation failed');
  expect(looksLikeMemory(alloc)).toBe(true);
  expect(plainCaptionError(alloc).name).toBe('OutOfMemoryError');

  const length = new RangeError('Invalid typed array length');
  expect(looksLikeMemory(length)).toBe(false);
  const plain = plainCaptionError(length);
  expect(plain.name).toBe('RangeError');
  expect(plain.message).not.toMatch(/memory/i);
  // The phone-memory message keeps the real class name for a cause that is not memory.
  expect(phoneSpeechMemoryError(length).name).toBe('RangeError');
});

test('a quota error is still not memory', () => {
  const quota = Object.assign(new Error('The quota has been exceeded'), { name: 'QuotaExceededError' });
  expect(looksLikeMemory(quota)).toBe(false);
  expect(plainCaptionError(quota).name).toBe('QuotaExceededError');
});
