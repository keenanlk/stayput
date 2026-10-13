import { test, expect } from '@playwright/test';
import { audioDecodeError, looksLikeMemory, plainCaptionError, phoneSpeechMemoryError } from '../src/lib/speech-errors';

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

test('an audio decode failure is recorded under the underlying class, and stays an audio decode failure to the page', () => {
  const unreadable = audioDecodeError('x', new DOMException('The requested file could not be read', 'NotReadableError'));
  expect(unreadable.name).toBe('NotReadableError');
  expect(unreadable.kind).toBe('AudioDecodeError');
  expect(audioDecodeError('x', new Error('whatever')).name).toBe('AudioDecodeError');
  // A decoder refusing the sound is what AudioDecodeError means; a RangeError is something else.
  expect(audioDecodeError('x', new DOMException('Unable to decode audio data', 'EncodingError')).name).toBe('AudioDecodeError');
  expect(audioDecodeError('x', new RangeError('Invalid typed array length')).name).toBe('RangeError');
  expect(audioDecodeError('x').name).toBe('AudioDecodeError');
});
