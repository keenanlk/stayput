import { test, expect } from '@playwright/test';
import { audioDecodeError, encodeFailedError, encodeMemoryError, looksLikeMemory, plainCaptionError, phoneSpeechMemoryError, restartsOnce, unknownCaptionError } from '../src/lib/speech-errors';

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

test('a failure that names no class is recorded under the step that failed, not as a bare Error', () => {
  const bare = new Error('whatever');
  expect(encodeFailedError(bare).name).toBe('RedrawFailed');
  expect(unknownCaptionError(bare).name).toBe('CaptionStepFailed');
  expect(encodeMemoryError(bare).name).toBe('RedrawFailed');
  expect(phoneSpeechMemoryError(bare).name).toBe('CaptionStepFailed');
  // A browser's own class still wins, and a memory failure is still memory.
  expect(encodeFailedError(new TypeError('x')).name).toBe('RedrawFailed');
  // A bare TypeError is never recorded as such: the step that failed names it.
  expect(unknownCaptionError(new TypeError('Failed to fetch')).name).toBe('CaptionStepFailed');
  expect(plainCaptionError(new TypeError('x')).name).toBe('CaptionStepFailed');
  expect(phoneSpeechMemoryError(new TypeError('x')).name).toBe('CaptionStepFailed');
  expect(audioDecodeError('x', new TypeError('x')).name).toBe('AudioDecodeError');
  expect(encodeMemoryError(new Error('Array buffer allocation failed')).name).toBe('OutOfMemoryError');
});

test('only a start-up that a fresh worker may get past is tried again', () => {
  for (const name of ['ModelLoadError', 'OutOfMemoryError', 'WorkerCrashError']) expect(restartsOnce({ name })).toBe(true);
  for (const name of ['ModelDownloadError', 'AudioDecodeError', 'NoSpeechFound', 'SpeechModelError']) expect(restartsOnce({ name })).toBe(false);
});
