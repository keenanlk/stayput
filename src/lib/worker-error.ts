/**
 * A failure inside a model worker, carried across postMessage as its class name
 * and message. The name is all a failed run records as its kind (see
 * classifyError); the message is only ever shown on the page, never sent.
 */

import { NamedError } from './input-error';

const CLASS_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

/** An engine that ran out of memory says so in its message, whatever it is called (an emscripten abort, a failed allocation). */
const MEMORY = /^Aborted\(|out of memory|Cannot enlarge memory|memory access out of bounds|could not allocate|allocation failed/i;

/**
 * What the worker posts for a failure: the error's own name when it looks like a class name. A failure with no usable
 * name (a plain Error, or something thrown that is not an error at all, as onnxruntime does) is OutOfMemoryError when
 * its message says memory ran out, else `fallback` (the step that failed, if the worker passes one), else "WorkerFailed".
 */
export function workerFailure(err: unknown, fallback?: string): { name: string; message: string } {
  const name = err instanceof Error || (typeof err === 'object' && err !== null && typeof (err as { name?: unknown }).name === 'string') ? (err as { name: string }).name : '';
  const message = err instanceof Error ? err.message : String(err);
  if (CLASS_NAME.test(name) && name !== 'Error') return { name, message };
  if (fallback === undefined) return { name: 'WorkerFailed', message };
  return { name: MEMORY.test(message) ? 'OutOfMemoryError' : fallback, message };
}

/** Rebuild the error on the page with the name it had in the worker. */
export function fromWorkerFailure(name: string | undefined, message: string): Error {
  return new NamedError(name && CLASS_NAME.test(name) && name !== 'Error' ? name : 'WorkerFailed', message);
}
