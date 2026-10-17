/**
 * A failure that arrives as a plain `Error` (or TypeError, RangeError, SyntaxError) says nothing about where it came
 * from in a failed run's record. This gives it the name of the step that failed, and leaves every error that already
 * has a name of its own (EncodingError, OutOfMemoryError, NotReadableError, our own classes) untouched, so the rules
 * that retry on those names still see them. Kept free of browser imports so a spec can drive it directly.
 */

import { NamedError } from './input-error';

const BARE = new Set(['', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError']);

/** Whether `e` carries no name beyond the generic ones. A RangeError that says memory is memory, and counts as named. */
export function isBare(e: unknown): boolean {
  if (!(e instanceof Error)) return true;
  if (e.name === 'RangeError' && /memory|allocation/i.test(e.message)) return false;
  return BARE.has(e.name);
}

/** `e` itself when it has a name; otherwise an error named `step` (letters and digits only), keeping `e` as its cause. */
export function nameBare(step: string, e: unknown): Error {
  if (!isBare(e)) return e as Error;
  const err = new NamedError(step, e instanceof Error && e.message ? e.message : 'Something went wrong.');
  err.cause = e;
  return err;
}
