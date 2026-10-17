/**
 * A failure inside a model worker, carried across postMessage as its class name
 * and message. The name is all a failed run records as its kind (see
 * classifyError); the message is only ever shown on the page, never sent.
 */

import { NamedError } from './input-error';

const CLASS_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

/** What the worker posts for a failure: the error's own name when it looks like a class name, else "WorkerFailed". */
export function workerFailure(err: unknown): { name: string; message: string } {
  const name = err instanceof Error || (typeof err === 'object' && err !== null && typeof (err as { name?: unknown }).name === 'string') ? (err as { name: string }).name : '';
  return { name: CLASS_NAME.test(name) && name !== 'Error' ? name : 'WorkerFailed', message: err instanceof Error ? err.message : String(err) };
}

/** Rebuild the error on the page with the name it had in the worker. */
export function fromWorkerFailure(name: string | undefined, message: string): Error {
  return new NamedError(name && CLASS_NAME.test(name) && name !== 'Error' ? name : 'WorkerFailed', message);
}
